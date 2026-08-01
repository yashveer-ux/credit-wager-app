import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import {
  blackjackEvents,
  blackjackHands,
  blackjackRounds,
  blackjackTablePlayers,
  blackjackTables,
  db,
  wallets,
  type Tx,
} from '../db/index.ts';
import { GameError } from '../games.ts';
import { postEntries } from '../ledger.ts';
import { formatAmount, parseAmount } from '../money.ts';
import {
  dealerShouldDraw,
  handValue,
  legalActions,
  newShoe,
  payoutFor,
  settleHand,
  shuffle,
  type Action,
  type Card,
} from './engine.ts';
import { bump, lockTable, type BjEvent } from './tables.ts';

/**
 * Server-authoritative round flow. Every command:
 * - runs in one DB transaction that locks the blackjack_tables row first, so
 *   commands on a table are strictly serialised;
 * - carries a client-generated commandId (uuid). Money commands use it as the
 *   ledger transaction id, so a retried debit is a no-op at the DB level; all
 *   commands additionally record it in their event payload, and a replay is
 *   rejected before it acts.
 *
 * Timers: only `deadlineAt` (a real timestamp on the round) is authoritative.
 * The realtime layer drives setTimeout off it and calls handleTimeout(), and a
 * restarted server re-arms from the persisted deadlines.
 */

const SHOE_DECKS = 6; // fresh shoe every round; 6 decks can never run out mid-round
const BETTING_MS = 30_000;
const TURN_MS = 30_000;

type TableRow = typeof blackjackTables.$inferSelect;
type HandRow = typeof blackjackHands.$inferSelect;

async function currentRound(tx: Tx, tableId: string) {
  const [round] = await tx
    .select()
    .from(blackjackRounds)
    .where(and(eq(blackjackRounds.tableId, tableId), isNull(blackjackRounds.settledAt)))
    .orderBy(desc(blackjackRounds.createdAt))
    .limit(1);
  return round;
}

async function memberSeat(tx: Tx, tableId: string, userId: string): Promise<number> {
  const [p] = await tx
    .select({ seat: blackjackTablePlayers.seat })
    .from(blackjackTablePlayers)
    .where(
      and(eq(blackjackTablePlayers.tableId, tableId), eq(blackjackTablePlayers.userId, userId)),
    );
  if (!p) throw new GameError('NOT_A_MEMBER', 'not seated at this table');
  return p.seat;
}

/** Rejects a commandId that already produced an event on this table. */
async function assertNewCommand(tx: Tx, tableId: string, commandId: string) {
  // ponytail: linear scan of the table's event log; add an expression index on
  // (table_id, payload->>'commandId') if tables ever live long enough to care.
  const [dup] = await tx
    .select({ id: blackjackEvents.id })
    .from(blackjackEvents)
    .where(
      and(
        eq(blackjackEvents.tableId, tableId),
        sql`${blackjackEvents.payload}->>'commandId' = ${commandId}`,
      ),
    )
    .limit(1);
  if (dup) throw new GameError('DUPLICATE_COMMAND', 'command already processed');
}

/**
 * Debit a wager under a wallet row lock. The ledger trigger does not enforce
 * non-negative balances, so sufficiency is checked here, exactly like convert.
 */
async function debitWager(
  tx: Tx,
  args: { userId: string; creditTypeId: string; amount: bigint; txnId: string; roundId: string },
) {
  const [w] = await tx
    .select({ balance: wallets.balance })
    .from(wallets)
    .where(and(eq(wallets.userId, args.userId), eq(wallets.creditTypeId, args.creditTypeId)))
    .for('update');
  if (!w) throw new GameError('NO_WALLET', 'no wallet for the table credit type');
  if (parseAmount(w.balance) < args.amount) {
    throw new GameError('INSUFFICIENT_BALANCE', 'insufficient balance');
  }
  const [balance] = await postEntries(tx, [
    {
      id: args.txnId,
      userId: args.userId,
      creditTypeId: args.creditTypeId,
      type: 'WAGER',
      amount: -args.amount,
      metadata: { game: 'blackjack', blackjackRoundId: args.roundId },
    },
  ]);
  return balance;
}

/**
 * Opens the betting phase. Requires the table OPEN and every seated player
 * ready. `deck` is for deterministic tests ONLY — the HTTP layer never passes
 * it, so a client cannot inject a shoe.
 */
export async function startRound(input: {
  userId: string;
  tableId: string;
  commandId: string;
  deck?: Card[];
}) {
  return db.transaction(async (tx) => {
    const table = await lockTable(tx, input.tableId);
    if (table.status !== 'OPEN') throw new GameError('BAD_PHASE', 'table is not open for a new round');
    const players = await tx
      .select()
      .from(blackjackTablePlayers)
      .where(eq(blackjackTablePlayers.tableId, input.tableId));
    if (!players.some((p) => p.userId === input.userId)) {
      throw new GameError('NOT_A_MEMBER', 'not seated at this table');
    }
    if (players.length === 0 || !players.every((p) => p.ready)) {
      throw new GameError('NOT_READY', 'all seated players must be ready');
    }

    const deck = input.deck ?? shuffle(newShoe(SHOE_DECKS));
    const deadlineAt = new Date(Date.now() + BETTING_MS);
    const [round] = await tx
      .insert(blackjackRounds)
      .values({ tableId: input.tableId, deck, phase: 'BETTING', deadlineAt })
      .returning({ id: blackjackRounds.id });
    await tx
      .update(blackjackTables)
      .set({ status: 'IN_ROUND' })
      .where(eq(blackjackTables.id, input.tableId));

    const events = [
      await bump(tx, input.tableId, 'betting_started', {
        commandId: input.commandId,
        roundId: round.id,
        deadlineAt: deadlineAt.toISOString(),
      }),
    ];
    return { roundId: round.id, events };
  });
}

/**
 * Stake a hand. Idempotent per hand: the commandId becomes wagerTxnId, so a
 * retry of the same bet returns duplicate:true and moves no money. Deals as
 * soon as every seated player has bet.
 */
export async function placeBet(input: {
  userId: string;
  tableId: string;
  commandId: string;
  amount: bigint;
}) {
  const { userId, tableId, commandId, amount } = input;
  return db.transaction(async (tx) => {
    const table = await lockTable(tx, tableId);
    const round = await currentRound(tx, tableId);
    if (!round || round.phase !== 'BETTING') throw new GameError('BAD_PHASE', 'betting is not open');

    const players = await tx
      .select()
      .from(blackjackTablePlayers)
      .where(eq(blackjackTablePlayers.tableId, tableId));
    const me = players.find((p) => p.userId === userId);
    if (!me) throw new GameError('NOT_A_MEMBER', 'not seated at this table');

    if (amount < parseAmount(table.minWager) || amount > parseAmount(table.maxWager)) {
      throw new GameError(
        'INVALID_AMOUNT',
        `wager must be between ${table.minWager} and ${table.maxWager}`,
      );
    }

    const hands = await tx
      .select()
      .from(blackjackHands)
      .where(eq(blackjackHands.roundId, round.id));
    const mine = hands.find((h) => h.seat === me.seat);
    if (mine) {
      // Same commandId = the retry of a bet that already landed. Different = a real second bet.
      if (mine.wagerTxnId === commandId) {
        return { duplicate: true as const, roundId: round.id, balance: null, events: [] as BjEvent[] };
      }
      throw new GameError('ALREADY_BET', 'bet already placed for this seat');
    }

    const balance = await debitWager(tx, {
      userId,
      creditTypeId: table.creditTypeId,
      amount,
      txnId: commandId,
      roundId: round.id,
    });
    await tx.insert(blackjackHands).values({
      roundId: round.id,
      userId,
      seat: me.seat,
      wager: formatAmount(amount),
      wagerTxnId: commandId,
    });

    const events = [
      await bump(tx, tableId, 'bet_placed', {
        commandId,
        roundId: round.id,
        seat: me.seat,
        userId,
        amount: formatAmount(amount),
      }),
    ];

    // Last bet in — deal now instead of waiting out the clock.
    if (hands.length + 1 >= players.length) {
      events.push(...(await deal(tx, table, round.id)));
    }
    return { duplicate: false as const, roundId: round.id, balance, events };
  });
}

/** Deals 2 cards per staked hand + 2 to the dealer (index 1 is the hole card). */
async function deal(tx: Tx, table: TableRow, roundId: string): Promise<BjEvent[]> {
  const [round] = await tx.select().from(blackjackRounds).where(eq(blackjackRounds.id, roundId));
  const deck = round.deck as Card[];
  const draw = () => {
    const c = deck.pop();
    if (!c) throw new Error('shoe exhausted'); // cannot happen with a 6-deck shoe
    return c;
  };

  const hands = await tx
    .select()
    .from(blackjackHands)
    .where(eq(blackjackHands.roundId, roundId))
    .orderBy(asc(blackjackHands.seat));

  for (const h of hands) {
    const cards = [draw(), draw()];
    await tx.update(blackjackHands).set({ cards }).where(eq(blackjackHands.id, h.id));
    h.cards = cards;
  }
  const dealerCards = [draw(), draw()];

  // A dealt 21 (blackjack) auto-stands, so the first turn goes to the first
  // seat that can still act. No one? Straight to the dealer.
  const firstSeat = hands.find((h) => handValue(h.cards as Card[]).total < 21)?.seat;
  const deadlineAt = new Date(Date.now() + TURN_MS);

  await tx
    .update(blackjackRounds)
    .set({
      deck,
      dealerCards,
      phase: firstSeat === undefined ? 'DEALER_TURN' : 'PLAYER_TURNS',
      activeSeat: firstSeat ?? null,
      deadlineAt: firstSeat === undefined ? null : deadlineAt,
    })
    .where(eq(blackjackRounds.id, roundId));

  const events = [
    await bump(tx, table.id, 'cards_dealt', {
      roundId,
      hands: hands.map((h) => ({ seat: h.seat, cards: h.cards })),
      dealerUpCard: dealerCards[0], // the hole card never leaves the server here
    }),
  ];

  if (firstSeat === undefined) {
    events.push(...(await dealerFinish(tx, table, roundId)));
  } else {
    events.push(
      await bump(tx, table.id, 'turn_started', {
        roundId,
        seat: firstSeat,
        deadlineAt: deadlineAt.toISOString(),
      }),
    );
  }
  return events;
}

/** hit / stand / double for the active seat. */
export async function playerAction(input: {
  userId: string;
  tableId: string;
  commandId: string;
  action: Action;
}) {
  const { userId, tableId, commandId, action } = input;
  return db.transaction(async (tx) => {
    const table = await lockTable(tx, tableId);
    const round = await currentRound(tx, tableId);
    if (!round || round.phase !== 'PLAYER_TURNS') throw new GameError('BAD_PHASE', 'no turn in progress');
    await memberSeat(tx, tableId, userId);
    await assertNewCommand(tx, tableId, commandId);

    const hands = await tx
      .select()
      .from(blackjackHands)
      .where(eq(blackjackHands.roundId, round.id))
      .orderBy(asc(blackjackHands.seat));
    const hand = hands.find((h) => h.seat === round.activeSeat);
    if (!hand || hand.userId !== userId) throw new GameError('OUT_OF_TURN', 'not your turn');

    const legal = legalActions(hand.cards as Card[], hand.doubled);
    if (!legal.includes(action)) throw new GameError('ILLEGAL_ACTION', `cannot ${action} now`);

    const deck = round.deck as Card[];
    const draw = () => {
      const c = deck.pop();
      if (!c) throw new Error('shoe exhausted');
      return c;
    };

    const events: BjEvent[] = [];
    let turnOver = false;

    if (action === 'hit') {
      const card = draw();
      const cards = [...(hand.cards as Card[]), card];
      hand.cards = cards;
      await tx.update(blackjackHands).set({ cards }).where(eq(blackjackHands.id, hand.id));
      const { total } = handValue(cards);
      events.push(
        await bump(tx, tableId, 'player_hit', { commandId, roundId: round.id, seat: hand.seat, card, total }),
      );
      if (total > 21) {
        events.push(await bump(tx, tableId, 'player_busted', { roundId: round.id, seat: hand.seat }));
        turnOver = true;
      } else if (total === 21) {
        turnOver = true; // nothing left to decide
      }
    } else if (action === 'stand') {
      events.push(
        await bump(tx, tableId, 'player_stood', { commandId, roundId: round.id, seat: hand.seat }),
      );
      turnOver = true;
    } else {
      // double: second wager of the same size, exactly one card, forced stand.
      const wager = parseAmount(hand.wager);
      await debitWager(tx, {
        userId,
        creditTypeId: table.creditTypeId,
        amount: wager,
        txnId: commandId, // ledger-level idempotency for the extra stake
        roundId: round.id,
      });
      const card = draw();
      const cards = [...(hand.cards as Card[]), card];
      hand.cards = cards;
      hand.doubled = true;
      await tx
        .update(blackjackHands)
        .set({ cards, doubled: true })
        .where(eq(blackjackHands.id, hand.id));
      const { total } = handValue(cards);
      events.push(
        await bump(tx, tableId, 'player_doubled', { commandId, roundId: round.id, seat: hand.seat, card, total }),
      );
      if (total > 21) {
        events.push(await bump(tx, tableId, 'player_busted', { roundId: round.id, seat: hand.seat }));
      }
      turnOver = true;
    }

    // Persist the shoe before anything downstream re-reads the round.
    await tx.update(blackjackRounds).set({ deck }).where(eq(blackjackRounds.id, round.id));

    if (turnOver) {
      events.push(...(await advance(tx, table, round.id, hand.seat, hands)));
    } else {
      const deadlineAt = new Date(Date.now() + TURN_MS);
      await tx.update(blackjackRounds).set({ deadlineAt }).where(eq(blackjackRounds.id, round.id));
      events.push(
        await bump(tx, tableId, 'turn_started', {
          roundId: round.id,
          seat: hand.seat,
          deadlineAt: deadlineAt.toISOString(),
        }),
      );
    }
    return { events };
  });
}

/**
 * Move to the next actionable seat after `fromSeat`. Turn order is strictly
 * ascending, so seats behind the cursor are done by construction; ahead of it,
 * busts and 21s are skipped. Nobody left = the dealer plays and settles.
 */
async function advance(
  tx: Tx,
  table: TableRow,
  roundId: string,
  fromSeat: number,
  hands: HandRow[],
): Promise<BjEvent[]> {
  const next = hands.find((h) => h.seat > fromSeat && handValue(h.cards as Card[]).total < 21);
  if (!next) return dealerFinish(tx, table, roundId);

  const deadlineAt = new Date(Date.now() + TURN_MS);
  await tx
    .update(blackjackRounds)
    .set({ activeSeat: next.seat, deadlineAt })
    .where(eq(blackjackRounds.id, roundId));
  return [
    await bump(tx, table.id, 'turn_started', {
      roundId,
      seat: next.seat,
      deadlineAt: deadlineAt.toISOString(),
    }),
  ];
}

/**
 * Dealer reveals, draws to 17, and the round settles — one transaction.
 * The phase-flip UPDATE below is the double-settlement guard: it matches only
 * a round not already at SETTLED, so a second entrant settles nothing.
 */
async function dealerFinish(tx: Tx, table: TableRow, roundId: string): Promise<BjEvent[]> {
  const [locked] = await tx
    .update(blackjackRounds)
    .set({ phase: 'DEALER_TURN', activeSeat: null, deadlineAt: null })
    .where(and(eq(blackjackRounds.id, roundId), ne(blackjackRounds.phase, 'SETTLED')))
    .returning();
  if (!locked) return [];

  const deck = locked.deck as Card[];
  const dealerCards = locked.dealerCards as Card[];
  const events: BjEvent[] = [
    await bump(tx, table.id, 'dealer_revealed', { roundId, cards: [...dealerCards] }),
  ];

  while (dealerShouldDraw(dealerCards)) {
    const card = deck.pop();
    if (!card) throw new Error('shoe exhausted');
    dealerCards.push(card);
    events.push(
      await bump(tx, table.id, 'dealer_drew', {
        roundId,
        card,
        total: handValue(dealerCards).total,
      }),
    );
  }

  const hands = await tx
    .select()
    .from(blackjackHands)
    .where(eq(blackjackHands.roundId, roundId))
    .orderBy(asc(blackjackHands.seat));

  const results: { seat: number; userId: string; outcome: string; payout: string }[] = [];
  for (const h of hands) {
    const outcome = settleHand(h.cards as Card[], dealerCards);
    const totalWager = parseAmount(h.wager) * (h.doubled ? 2n : 1n);
    const payout = payoutFor(outcome, totalWager);
    const payoutTxnId = payout > 0n ? randomUUID() : null;

    // Ledger row first: the hand's payout_txn_id has an FK onto transactions.
    if (payout > 0n) {
      const [balance] = await postEntries(tx, [
        {
          id: payoutTxnId!, // idempotent per hand: a replayed insert is skipped
          userId: h.userId,
          creditTypeId: table.creditTypeId,
          type: 'PAYOUT',
          amount: payout,
          metadata: { game: 'blackjack', blackjackRoundId: roundId, outcome },
        },
      ]);
      events.push(
        await bump(tx, table.id, 'balance_updated', { roundId, userId: h.userId, balance }),
      );
    }

    await tx
      .update(blackjackHands)
      .set({ outcome, payout: formatAmount(payout), payoutTxnId })
      .where(and(eq(blackjackHands.id, h.id), isNull(blackjackHands.outcome)));
    results.push({ seat: h.seat, userId: h.userId, outcome, payout: formatAmount(payout) });
  }

  await tx
    .update(blackjackRounds)
    .set({ phase: 'SETTLED', settledAt: new Date(), deck, dealerCards })
    .where(eq(blackjackRounds.id, roundId));
  await tx.update(blackjackTables).set({ status: 'OPEN' }).where(eq(blackjackTables.id, table.id));
  // Next round needs a fresh show of hands.
  await tx
    .update(blackjackTablePlayers)
    .set({ ready: false })
    .where(eq(blackjackTablePlayers.tableId, table.id));

  events.push(await bump(tx, table.id, 'round_settled', { roundId, dealerCards, results }));
  return events;
}

/**
 * Deadline enforcement, called by the realtime timer (and safe to call any
 * time). BETTING deadline: deal whoever has bet, or cancel a bet-less round.
 * PLAYER_TURNS deadline: auto-stand the active seat.
 */
export async function handleTimeout(tableId: string): Promise<{ events: BjEvent[] }> {
  return db.transaction(async (tx) => {
    const table = await lockTable(tx, tableId);
    const round = await currentRound(tx, tableId);
    if (!round?.deadlineAt || round.deadlineAt.getTime() > Date.now()) return { events: [] };

    if (round.phase === 'BETTING') {
      const staked = await tx
        .select({ id: blackjackHands.id })
        .from(blackjackHands)
        .where(eq(blackjackHands.roundId, round.id))
        .limit(1);
      if (staked.length > 0) return { events: await deal(tx, table, round.id) };

      // Nobody put money down: cancel, nothing to refund.
      await tx
        .update(blackjackRounds)
        .set({ phase: 'SETTLED', settledAt: new Date(), deadlineAt: null })
        .where(eq(blackjackRounds.id, round.id));
      await tx.update(blackjackTables).set({ status: 'OPEN' }).where(eq(blackjackTables.id, tableId));
      await tx
        .update(blackjackTablePlayers)
        .set({ ready: false })
        .where(eq(blackjackTablePlayers.tableId, tableId));
      return { events: [await bump(tx, tableId, 'round_cancelled', { roundId: round.id })] };
    }

    if (round.phase === 'PLAYER_TURNS' && round.activeSeat !== null) {
      const hands = await tx
        .select()
        .from(blackjackHands)
        .where(eq(blackjackHands.roundId, round.id))
        .orderBy(asc(blackjackHands.seat));
      const events = [
        await bump(tx, tableId, 'player_stood', {
          roundId: round.id,
          seat: round.activeSeat,
          timeout: true,
        }),
      ];
      events.push(...(await advance(tx, table, round.id, round.activeSeat, hands)));
      return { events };
    }

    return { events: [] };
  });
}
