import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

/**
 * Integration tests against the Docker Postgres. The deck is stacked via
 * startRound's test-only `deck` parameter (the HTTP layer never exposes it),
 * so every deal is deterministic. "Two clients" are two userIds driven from
 * this one process — real socket concurrency is not exercised here.
 */
describe.skipIf(!url)('blackjack rounds', () => {
  const sql = postgres(url!);

  let tablesMod: typeof import('../src/blackjack/tables.ts');
  let roundMod: typeof import('../src/blackjack/round.ts');
  let dbMod: typeof import('../src/db/index.ts');

  const stamp = Date.now();
  let userA: string;
  let userB: string;
  let userC: string; // low balance
  let userD: string; // never a member of the main table
  let tokenTypeId: string;
  let tableId: string;
  let roomCode: string;

  // deal() pops from the END of the deck array, so the first card dealt goes
  // last. Filler sits at the front (bottom of the shoe) and is never reached.
  const stacked = (popOrder: string[]) => ['2C', '3C', '4C', ...[...popOrder].reverse()];

  const newUser = async (label: string) => {
    const [u] = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${`bj-${label}-${stamp}@example.test`}, 'not-a-real-hash', ${`BJ ${label}`})
      RETURNING id
    `;
    return u.id as string;
  };

  const fund = async (userId: string, amount: string) => {
    await sql`
      INSERT INTO wallets (user_id, credit_type_id) VALUES (${userId}, ${tokenTypeId})
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO transactions (user_id, type, credit_type_id, amount, balance_after)
      VALUES (${userId}, 'ADJUSTMENT', ${tokenTypeId}, ${amount}, '0')
    `;
  };

  const balance = async (userId: string) => {
    const [w] = await sql`
      SELECT balance FROM wallets WHERE user_id = ${userId} AND credit_type_id = ${tokenTypeId}
    `;
    return w.balance as string;
  };

  const txnCount = async (userId: string, type: string) => {
    const [r] = await sql`
      SELECT count(*)::int AS n FROM transactions WHERE user_id = ${userId} AND type = ${type}
    `;
    return r.n as number;
  };

  const forceDeadline = async (roundId: string) => {
    await sql`UPDATE blackjack_rounds SET deadline_at = now() - interval '2 seconds' WHERE id = ${roundId}`;
  };

  const rawRound = async (roundId: string) => {
    const [r] = await sql`SELECT * FROM blackjack_rounds WHERE id = ${roundId}`;
    return r;
  };

  const rawHands = async (roundId: string) => {
    return sql`SELECT * FROM blackjack_hands WHERE round_id = ${roundId} ORDER BY seat`;
  };

  beforeAll(async () => {
    [tablesMod, roundMod, dbMod] = await Promise.all([
      import('../src/blackjack/tables.ts'),
      import('../src/blackjack/round.ts'),
      import('../src/db/index.ts'),
    ]);

    const [ct] = await sql`SELECT id FROM credit_types WHERE code = 'SIM_AI_TOKEN'`;
    if (!ct) throw new Error('SIM_AI_TOKEN missing — run `npm run db:seed`');
    tokenTypeId = ct.id;

    [userA, userB, userC, userD] = await Promise.all([
      newUser('a'),
      newUser('b'),
      newUser('c'),
      newUser('d'),
    ]);
    await fund(userA, '10000.0000');
    await fund(userB, '10000.0000');
    await fund(userC, '50.0000');
    await fund(userD, '1000.0000');
  });

  afterAll(async () => {
    await dbMod?.sql.end();
    await sql.end();
  });

  // ------------------------------------------------------------ lobby & seats

  it('creates a private table with a room code and seats the creator', async () => {
    const created = await tablesMod.createTable({ userId: userA, isPrivate: true });
    tableId = created.tableId;
    roomCode = created.roomCode!;
    expect(created.seat).toBe(0);
    expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(created.events.map((e) => e.type)).toEqual(['table_created', 'player_joined']);
  });

  it('joins by room code (case-insensitive) and assigns the next seat', async () => {
    const joined = await tablesMod.joinTable({ userId: userB, roomCode: roomCode.toLowerCase() });
    expect(joined.tableId).toBe(tableId);
    expect(joined.seat).toBe(1);

    // Rejoin is idempotent, no duplicate seat, no event.
    const again = await tablesMod.joinTable({ userId: userB, tableId });
    expect(again.seat).toBe(1);
    expect(again.events).toHaveLength(0);
  });

  it('hides a private table from non-members', async () => {
    await expect(tablesMod.getTableState(tableId, userD)).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('refuses to start until everyone is ready', async () => {
    await tablesMod.setReady({ userId: userA, tableId, ready: true });
    await expect(
      roundMod.startRound({ userId: userA, tableId, commandId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_READY' });
    await tablesMod.setReady({ userId: userB, tableId, ready: true });
  });

  // -------------------------------------------------- round 1: stand + double

  let round1: string;

  it('starts a round into BETTING and blocks a second start', async () => {
    // A: TS,9S (19). B: TH,7H (17). Dealer: TD up, 5C hole (15).
    // B doubles into 4H (21). Dealer draws 2D (17).
    const started = await roundMod.startRound({
      userId: userA,
      tableId,
      commandId: randomUUID(),
      deck: stacked(['TS', '9S', 'TH', '7H', 'TD', '5C', '4H', '2D']),
    });
    round1 = started.roundId;
    expect(started.events.map((e) => e.type)).toEqual(['betting_started']);

    await expect(
      roundMod.startRound({ userId: userA, tableId, commandId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'BAD_PHASE' });
  });

  it('rejects bets from non-members and bets outside the table limits', async () => {
    await expect(
      roundMod.placeBet({ userId: userD, tableId, commandId: randomUUID(), amount: 100_0000n }),
    ).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
    await expect(
      roundMod.placeBet({ userId: userB, tableId, commandId: randomUUID(), amount: 5_0000n }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' }); // below the 10 minimum
  });

  it('debits a bet once, and a retried commandId is a no-op', async () => {
    const cmd = randomUUID();
    const first = await roundMod.placeBet({ userId: userA, tableId, commandId: cmd, amount: 100_0000n });
    expect(first.duplicate).toBe(false);
    expect(first.balance).toBe('9900.0000');

    const retry = await roundMod.placeBet({ userId: userA, tableId, commandId: cmd, amount: 100_0000n });
    expect(retry.duplicate).toBe(true);
    expect(await txnCount(userA, 'WAGER')).toBe(1);
    expect(await balance(userA)).toBe('9900.0000');

    // A different commandId is a real second bet — one hand per seat.
    await expect(
      roundMod.placeBet({ userId: userA, tableId, commandId: randomUUID(), amount: 100_0000n }),
    ).rejects.toMatchObject({ code: 'ALREADY_BET' });
  });

  it('deals when the last player bets, hole card hidden', async () => {
    const res = await roundMod.placeBet({ userId: userB, tableId, commandId: randomUUID(), amount: 100_0000n });
    const types = res.events.map((e) => e.type);
    expect(types).toEqual(['bet_placed', 'cards_dealt', 'turn_started']);

    const dealt = res.events.find((e) => e.type === 'cards_dealt')!;
    expect(dealt.payload.dealerUpCard).toBe('TD');
    expect(JSON.stringify(dealt.payload)).not.toContain('"5C"'); // hole never in an event

    const hands = await rawHands(round1);
    expect(hands[0].cards).toEqual(['TS', '9S']);
    expect(hands[1].cards).toEqual(['TH', '7H']);
    expect(hands[0].wager_txn_id).not.toBeNull();

    const round = await rawRound(round1);
    expect(round.phase).toBe('PLAYER_TURNS');
    expect(round.active_seat).toBe(0);
    expect(round.dealer_cards).toEqual(['TD', '5C']); // server knows, clients must not
  });

  it('never leaks the deck or the hole card through the safe projection', async () => {
    const state = await tablesMod.getTableState(tableId, userB);
    expect(state.round!.dealerCards).toEqual(['TD']);
    const json = JSON.stringify(state);
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('"5C"'); // the hole card
    expect(json).not.toContain('"2C"'); // an undealt card from the shoe
  });

  it('rejects out-of-turn and non-member actions', async () => {
    await expect(
      roundMod.playerAction({ userId: userB, tableId, commandId: randomUUID(), action: 'hit' }),
    ).rejects.toMatchObject({ code: 'OUT_OF_TURN' });
    await expect(
      roundMod.playerAction({ userId: userD, tableId, commandId: randomUUID(), action: 'hit' }),
    ).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('stand advances the turn, and replaying the command is rejected', async () => {
    const cmd = randomUUID();
    const res = await roundMod.playerAction({ userId: userA, tableId, commandId: cmd, action: 'stand' });
    expect(res.events.map((e) => e.type)).toEqual(['player_stood', 'turn_started']);
    expect((await rawRound(round1)).active_seat).toBe(1);

    await expect(
      roundMod.playerAction({ userId: userA, tableId, commandId: cmd, action: 'stand' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_COMMAND' });
  });

  it('double takes a second wager, one card, then the dealer plays and settles', async () => {
    const res = await roundMod.playerAction({
      userId: userB,
      tableId,
      commandId: randomUUID(),
      action: 'double',
    });
    const types = res.events.map((e) => e.type);
    expect(types).toContain('player_doubled');
    expect(types).toContain('dealer_revealed');
    expect(types).toContain('dealer_drew'); // 15 -> 17
    expect(types).toContain('round_settled');

    const hands = await rawHands(round1);
    // A: 19 v 17 -> WIN pays 2x100. B: doubled 21 v 17 -> WIN pays 2x200.
    expect(hands[0].outcome).toBe('WIN');
    expect(hands[0].payout).toBe('200.0000');
    expect(hands[1].outcome).toBe('WIN');
    expect(hands[1].doubled).toBe(true);
    expect(hands[1].payout).toBe('400.0000');
    expect(hands[0].payout_txn_id).not.toBeNull();
    expect(hands[1].payout_txn_id).not.toBeNull();

    expect(await balance(userA)).toBe('10100.0000'); // 10000 - 100 + 200
    expect(await balance(userB)).toBe('10200.0000'); // 10000 - 200 + 400
    expect(await txnCount(userB, 'WAGER')).toBe(2); // bet + double

    const round = await rawRound(round1);
    expect(round.phase).toBe('SETTLED');
    expect(round.settled_at).not.toBeNull();
    const [t] = await sql`SELECT status FROM blackjack_tables WHERE id = ${tableId}`;
    expect(t.status).toBe('OPEN');
  });

  it('cannot settle twice: timeout after settlement is a no-op', async () => {
    const payoutsA = await txnCount(userA, 'PAYOUT');
    const payoutsB = await txnCount(userB, 'PAYOUT');
    const res = await roundMod.handleTimeout(tableId);
    expect(res.events).toHaveLength(0);
    expect(await txnCount(userA, 'PAYOUT')).toBe(payoutsA);
    expect(await txnCount(userB, 'PAYOUT')).toBe(payoutsB);
    // And a late action against the settled round is refused.
    await expect(
      roundMod.playerAction({ userId: userB, tableId, commandId: randomUUID(), action: 'stand' }),
    ).rejects.toMatchObject({ code: 'BAD_PHASE' });
  });

  // ------------------------------------- round 2: bust and illegal double

  it('busts a hand, skips it at settlement, and blocks double after a hit', async () => {
    await tablesMod.setReady({ userId: userA, tableId, ready: true });
    await tablesMod.setReady({ userId: userB, tableId, ready: true });
    // A: 9S,8S (17) hits 2H (19), hits KD (29, bust). B: TH,6H (16) stands.
    // Dealer: TD,9D (19) stands.
    const { roundId } = await roundMod.startRound({
      userId: userB,
      tableId,
      commandId: randomUUID(),
      deck: stacked(['9S', '8S', 'TH', '6H', 'TD', '9D', '2H', 'KD']),
    });
    await roundMod.placeBet({ userId: userA, tableId, commandId: randomUUID(), amount: 100_0000n });
    await roundMod.placeBet({ userId: userB, tableId, commandId: randomUUID(), amount: 100_0000n });

    await roundMod.playerAction({ userId: userA, tableId, commandId: randomUUID(), action: 'hit' });
    await expect(
      roundMod.playerAction({ userId: userA, tableId, commandId: randomUUID(), action: 'double' }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_ACTION' }); // three cards now

    const bust = await roundMod.playerAction({ userId: userA, tableId, commandId: randomUUID(), action: 'hit' });
    expect(bust.events.map((e) => e.type)).toEqual(['player_hit', 'player_busted', 'turn_started']);

    await roundMod.playerAction({ userId: userB, tableId, commandId: randomUUID(), action: 'stand' });

    const hands = await rawHands(roundId);
    expect(hands[0].outcome).toBe('BUST');
    expect(hands[0].payout).toBe('0.0000');
    expect(hands[1].outcome).toBe('LOSS'); // 16 v 19
    expect(await balance(userA)).toBe('10000.0000');
    expect(await balance(userB)).toBe('10100.0000');
  });

  // ------------------------------------------- round 3: blackjack + races

  it('pays blackjack 2.5x and skips the natural in the turn order', async () => {
    await tablesMod.setReady({ userId: userA, tableId, ready: true });
    await tablesMod.setReady({ userId: userB, tableId, ready: true });
    // A: AS,KS (blackjack). B: 9H,9C (18). Dealer: TD,7D (17).
    const { roundId } = await roundMod.startRound({
      userId: userA,
      tableId,
      commandId: randomUUID(),
      deck: stacked(['AS', 'KS', '9H', '9C', 'TD', '7D']),
    });
    await roundMod.placeBet({ userId: userA, tableId, commandId: randomUUID(), amount: 100_0000n });
    await roundMod.placeBet({ userId: userB, tableId, commandId: randomUUID(), amount: 100_0000n });

    expect((await rawRound(roundId)).active_seat).toBe(1); // A's natural auto-stands

    // Two simultaneous commands from one client: the table lock serialises
    // them, exactly one acts. (Simulated concurrency, single process.)
    const results = await Promise.allSettled([
      roundMod.playerAction({ userId: userB, tableId, commandId: randomUUID(), action: 'stand' }),
      roundMod.playerAction({ userId: userB, tableId, commandId: randomUUID(), action: 'stand' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const hands = await rawHands(roundId);
    expect(hands[0].outcome).toBe('BLACKJACK');
    expect(hands[0].payout).toBe('250.0000');
    expect(hands[1].outcome).toBe('WIN'); // 18 v 17
    expect(await balance(userA)).toBe('10150.0000'); // 10000 - 100 + 250
    expect(await balance(userB)).toBe('10200.0000');
  });

  // ---------------------------- round 4: push, turn timeouts, leaving mid-round

  it('auto-stands on deadline, survives a mid-round leave, and pays a push back', async () => {
    await tablesMod.setReady({ userId: userA, tableId, ready: true });
    await tablesMod.setReady({ userId: userB, tableId, ready: true });
    // A: 9S,9H (18). B: TH,TC (20). Dealer: TD,8D (18). No draws.
    const { roundId } = await roundMod.startRound({
      userId: userA,
      tableId,
      commandId: randomUUID(),
      deck: stacked(['9S', '9H', 'TH', 'TC', 'TD', '8D']),
    });
    await roundMod.placeBet({ userId: userA, tableId, commandId: randomUUID(), amount: 100_0000n });
    await roundMod.placeBet({ userId: userB, tableId, commandId: randomUUID(), amount: 100_0000n });

    // B walks out mid-round; the hand stays in play.
    await tablesMod.leaveTable({ userId: userB, tableId });

    await forceDeadline(roundId);
    const t1 = await roundMod.handleTimeout(tableId);
    expect(t1.events.map((e) => e.type)).toEqual(['player_stood', 'turn_started']);
    expect(t1.events[0].payload.timeout).toBe(true);
    expect((await rawRound(roundId)).active_seat).toBe(1);

    await forceDeadline(roundId);
    const t2 = await roundMod.handleTimeout(tableId);
    expect(t2.events.map((e) => e.type)).toContain('round_settled');

    const hands = await rawHands(roundId);
    expect(hands[0].outcome).toBe('PUSH'); // 18 v 18: stake back
    expect(hands[0].payout).toBe('100.0000');
    expect(hands[1].outcome).toBe('WIN'); // 20 v 18, paid even though B left
    expect(await balance(userA)).toBe('10150.0000'); // unchanged by a push
    expect(await balance(userB)).toBe('10300.0000');
  });

  // -------------------------------------------- round 5: cancel + close

  it('cancels a bet-less round on deadline and closes the table when empty', async () => {
    await tablesMod.setReady({ userId: userA, tableId, ready: true });
    const { roundId } = await roundMod.startRound({ userId: userA, tableId, commandId: randomUUID() });

    await forceDeadline(roundId);
    const res = await roundMod.handleTimeout(tableId);
    expect(res.events.map((e) => e.type)).toEqual(['round_cancelled']);
    expect((await rawRound(roundId)).settled_at).not.toBeNull();

    const left = await tablesMod.leaveTable({ userId: userA, tableId });
    expect(left.events.map((e) => e.type)).toEqual(['player_left', 'table_closed']);
    const [t] = await sql`SELECT status FROM blackjack_tables WHERE id = ${tableId}`;
    expect(t.status).toBe('CLOSED');

    await expect(tablesMod.joinTable({ userId: userD, tableId })).rejects.toMatchObject({
      code: 'TABLE_CLOSED',
    });
  });

  it('kept the event log gapless: seq runs 1..version with no holes', async () => {
    const [t] = await sql`SELECT version FROM blackjack_tables WHERE id = ${tableId}`;
    const rows = await sql`
      SELECT seq FROM blackjack_events WHERE table_id = ${tableId} ORDER BY seq
    `;
    expect(rows.length).toBe(t.version);
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: t.version }, (_, i) => i + 1));
  });

  // --------------------------------------------------- money guard rails

  it('refuses a bet the wallet cannot cover, leaving no hand and no ledger row', async () => {
    const own = await tablesMod.createTable({ userId: userC, isPrivate: false });
    await tablesMod.setReady({ userId: userC, tableId: own.tableId, ready: true });
    const { roundId } = await roundMod.startRound({
      userId: userC,
      tableId: own.tableId,
      commandId: randomUUID(),
    });

    await expect(
      roundMod.placeBet({ userId: userC, tableId: own.tableId, commandId: randomUUID(), amount: 100_0000n }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

    expect(await rawHands(roundId)).toHaveLength(0);
    expect(await txnCount(userC, 'WAGER')).toBe(0);
    expect(await balance(userC)).toBe('50.0000');

    await tablesMod.leaveTable({ userId: userC, tableId: own.tableId });
  });

  it('quick match seats the user at some open public table', async () => {
    const res = await tablesMod.quickMatch(userD);
    expect(res.tableId).toBeDefined();
    const state = await tablesMod.getTableState(res.tableId, userD);
    expect(state.players.some((p) => p.userId === userD)).toBe(true);
    await tablesMod.leaveTable({ userId: userD, tableId: res.tableId });
  });
});
