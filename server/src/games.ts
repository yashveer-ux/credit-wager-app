import { and, eq, isNull, sql } from 'drizzle-orm';

import { creditTypes, db, gameRounds, games, wallets } from './db/index.ts';
import { postEntries } from './ledger.ts';
import { formatAmount } from './money.ts';

/**
 * Wagering against the ledger.
 *
 * IMPORTANT — this prototype trusts the client's reported outcome. The games
 * run their RNG on the device and tell the server what happened, so anyone who
 * can edit a request can mint tokens. That is a deliberate scope decision, and
 * it is the opposite of the spec's "never trust client-submitted results".
 * Making this real means the server owning the RNG and recording an rng_seed,
 * which is why that column exists and is left null here.
 *
 * The ledger integrity guarantees still hold regardless: balances only move via
 * transactions rows, and those rows are append-only.
 */

/** Games are wagered in AI Tokens only. */
export const GAME_CREDIT_CODE = 'SIM_AI_TOKEN';

export class GameError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

const OUTCOMES = ['WIN', 'LOSS', 'PUSH'] as const;
export type Outcome = (typeof OUTCOMES)[number];

async function creditTypeId(): Promise<string> {
  const [row] = await db
    .select({ id: creditTypes.id })
    .from(creditTypes)
    .where(eq(creditTypes.code, GAME_CREDIT_CODE));
  if (!row) throw new GameError('UNKNOWN_CREDIT_TYPE', 'run `npm run db:seed`');
  return row.id;
}

/**
 * A ledger insert raises if the wallet is missing, and users who registered
 * before this credit type existed have none. Cheaper to open one on demand than
 * to backfill and hope no other credit type is ever added.
 */
async function ensureWallet(userId: string, creditTypeId: string) {
  await db.insert(wallets).values({ userId, creditTypeId }).onConflictDoNothing();
}

/**
 * Stakes money on a round, opening it if this is the first stake.
 *
 * A round can be staked more than once — blackjack's double down puts a second
 * bet on the same hand — so idempotency keys off `stakeId`, not `roundId`. The
 * mobile queue retries jobs it cannot confirm landed, and reusing the round id
 * would make a double down look like a retry of the opening bet.
 */
export async function placeWager(input: {
  userId: string;
  gameCode: string;
  roundId: string;
  stakeId: string;
  amount: bigint;
}) {
  const { userId, gameCode, roundId, stakeId, amount } = input;
  if (amount <= 0n) throw new GameError('INVALID_AMOUNT', 'wager must be positive');

  const [game] = await db.select().from(games).where(eq(games.code, gameCode));
  if (!game) throw new GameError('UNKNOWN_GAME', `no game with code ${gameCode}`);

  const typeId = await creditTypeId();
  await ensureWallet(userId, typeId);

  return db.transaction(async (tx) => {
    const [opened] = await tx
      .insert(gameRounds)
      .values({
        id: roundId,
        gameId: game.id,
        userId,
        creditTypeId: typeId,
        wagerAmount: formatAmount(amount),
      })
      .onConflictDoNothing({ target: gameRounds.id })
      .returning({ id: gameRounds.id });

    if (!opened) {
      const [existing] = await tx
        .select({ userId: gameRounds.userId, settledAt: gameRounds.settledAt })
        .from(gameRounds)
        .where(eq(gameRounds.id, roundId));
      if (existing.userId !== userId) throw new GameError('UNKNOWN_ROUND', 'no such round');
      if (existing.settledAt) throw new GameError('ROUND_SETTLED', 'round already settled');

      // An additional stake on an open round. wager_amount tracks the total so
      // it stays consistent with the sum of the round's WAGER rows.
      await tx
        .update(gameRounds)
        .set({ wagerAmount: sql`${gameRounds.wagerAmount} + ${formatAmount(amount)}` })
        .where(eq(gameRounds.id, roundId));
    }

    const [balance] = await postEntries(tx, [
      {
        id: stakeId,
        userId,
        creditTypeId: typeId,
        type: 'WAGER',
        amount: -amount,
        relatedGameRoundId: roundId,
        metadata: { game: gameCode },
      },
    ]);

    // A null balance means this exact stake was already posted — a retry.
    return { roundId, balance, duplicate: balance === null };
  });
}

/**
 * Closes a round and credits the return.
 *
 * `payout` is the total returned to the player including their stake, matching
 * how the client's payout table defines each multiple — so a 2x win on 100 is a
 * payout of 200 against a wager of 100.
 */
export async function settleRound(input: {
  userId: string;
  roundId: string;
  outcome: Outcome;
  payout: bigint;
  label?: string;
}) {
  const { userId, roundId, outcome, payout, label } = input;
  if (payout < 0n) throw new GameError('INVALID_AMOUNT', 'payout cannot be negative');
  if (!OUTCOMES.includes(outcome)) throw new GameError('INVALID_OUTCOME', 'unknown outcome');

  return db.transaction(async (tx) => {
    // Settling is one-shot: the WHERE clause means a replayed settle matches
    // nothing rather than paying out twice.
    const [round] = await tx
      .update(gameRounds)
      .set({ outcome, payoutAmount: formatAmount(payout), settledAt: new Date() })
      .where(
        and(
          eq(gameRounds.id, roundId),
          eq(gameRounds.userId, userId),
          isNull(gameRounds.settledAt),
        ),
      )
      .returning({ creditTypeId: gameRounds.creditTypeId });

    if (!round) {
      // Either already settled, or not this user's round. Both are no-ops; the
      // client's retry queue treats it as done and stops asking.
      const [existing] = await tx
        .select({ id: gameRounds.id })
        .from(gameRounds)
        .where(and(eq(gameRounds.id, roundId), eq(gameRounds.userId, userId)));
      if (!existing) throw new GameError('UNKNOWN_ROUND', 'no such round');
      return { balance: null, duplicate: true as const };
    }

    // A loss returns nothing, and the ledger refuses zero-amount rows.
    if (payout === 0n) return { balance: null, duplicate: false as const };

    const [balance] = await postEntries(tx, [
      {
        userId,
        creditTypeId: round.creditTypeId,
        type: 'PAYOUT',
        amount: payout,
        relatedGameRoundId: roundId,
        metadata: { outcome, ...(label ? { label } : {}) },
      },
    ]);

    return { balance, duplicate: false as const };
  });
}

/** Demo top-up. Simulated tokens have no value, so this is a grant, not a purchase. */
export async function grantTokens(userId: string, amount: bigint) {
  if (amount <= 0n) throw new GameError('INVALID_AMOUNT', 'grant must be positive');

  const typeId = await creditTypeId();
  await ensureWallet(userId, typeId);

  return db.transaction(async (tx) => {
    const [balance] = await postEntries(tx, [
      {
        userId,
        creditTypeId: typeId,
        type: 'ADJUSTMENT',
        amount,
        metadata: { reason: 'FAUCET' },
      },
    ]);
    return { balance };
  });
}
