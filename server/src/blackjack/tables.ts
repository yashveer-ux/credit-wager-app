import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import {
  blackjackEvents,
  blackjackHands,
  blackjackRounds,
  blackjackTablePlayers,
  blackjackTables,
  creditTypes,
  db,
  users,
  type Tx,
} from '../db/index.ts';
import { GAME_CREDIT_CODE, GameError } from '../games.ts';
import type { Card } from './engine.ts';

/**
 * Table lifecycle. Every mutation runs inside a transaction that first locks
 * the blackjack_tables row FOR UPDATE, so all changes to one table are
 * serialised — no two commands interleave on the same table.
 *
 * Every state change bumps `version` and appends a blackjack_events row whose
 * seq IS the new version, so "latest version" and "latest event" are the same
 * number and reconnecting clients resync with one integer.
 */

export type BjEvent = {
  type: string;
  tableId: string;
  version: number;
  ts: string;
  payload: Record<string, unknown>;
};

/** Bump the table version and append the matching event row. Callers hold the table lock. */
export async function bump(
  tx: Tx,
  tableId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<BjEvent> {
  const [row] = await tx
    .update(blackjackTables)
    .set({ version: sql`${blackjackTables.version} + 1`, updatedAt: new Date() })
    .where(eq(blackjackTables.id, tableId))
    .returning({ version: blackjackTables.version });
  await tx.insert(blackjackEvents).values({ tableId, seq: row.version, type, payload });
  return { type, tableId, version: row.version, ts: new Date().toISOString(), payload };
}

/** Locks and returns the table row, serialising all commands against it. */
export async function lockTable(tx: Tx, tableId: string) {
  const [table] = await tx
    .select()
    .from(blackjackTables)
    .where(eq(blackjackTables.id, tableId))
    .for('update');
  if (!table) throw new GameError('UNKNOWN_TABLE', 'no such table');
  return table;
}

async function gameCreditTypeId(): Promise<string> {
  const [row] = await db
    .select({ id: creditTypes.id })
    .from(creditTypes)
    .where(eq(creditTypes.code, GAME_CREDIT_CODE));
  if (!row) throw new GameError('UNKNOWN_CREDIT_TYPE', 'run `npm run db:seed`');
  return row.id;
}

// No 0/O/1/I/L: these codes get read out loud across a room.
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newRoomCode = () =>
  Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');

export async function createTable(input: { userId: string; isPrivate?: boolean }) {
  const { userId, isPrivate = false } = input;
  const creditTypeId = await gameCreditTypeId();

  return db.transaction(async (tx) => {
    const [table] = await tx
      .insert(blackjackTables)
      .values({ isPrivate, roomCode: isPrivate ? newRoomCode() : null, creditTypeId })
      .returning();
    await tx.insert(blackjackTablePlayers).values({ tableId: table.id, userId, seat: 0 });
    const events = [
      await bump(tx, table.id, 'table_created', { isPrivate }),
      await bump(tx, table.id, 'player_joined', { userId, seat: 0 }),
    ];
    return { tableId: table.id, roomCode: table.roomCode, seat: 0, events };
  });
}

export async function joinTable(input: { userId: string; tableId?: string; roomCode?: string }) {
  let tableId = input.tableId;
  if (!tableId) {
    const code = (input.roomCode ?? '').trim().toUpperCase();
    const [t] = await db
      .select({ id: blackjackTables.id })
      .from(blackjackTables)
      .where(eq(blackjackTables.roomCode, code));
    if (!t) throw new GameError('UNKNOWN_TABLE', 'no table with that room code');
    tableId = t.id;
  }

  return db.transaction(async (tx) => {
    const table = await lockTable(tx, tableId);
    if (table.status === 'CLOSED') throw new GameError('TABLE_CLOSED', 'table is closed');

    const players = await tx
      .select()
      .from(blackjackTablePlayers)
      .where(eq(blackjackTablePlayers.tableId, tableId));

    // Rejoin is idempotent: you get your seat back, no event spam.
    const existing = players.find((p) => p.userId === input.userId);
    if (existing) return { tableId, seat: existing.seat, events: [] as BjEvent[] };

    const taken = new Set(players.map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    if (seat >= table.maxSeats) throw new GameError('TABLE_FULL', 'no free seats');

    await tx.insert(blackjackTablePlayers).values({ tableId, userId: input.userId, seat });
    const events = [await bump(tx, tableId, 'player_joined', { userId: input.userId, seat })];
    return { tableId, seat, events };
  });
}

/** Join the first open public table with a free seat, or open a fresh one. */
export async function quickMatch(userId: string) {
  const candidates = await db
    .select({ id: blackjackTables.id })
    .from(blackjackTables)
    .where(and(eq(blackjackTables.isPrivate, false), eq(blackjackTables.status, 'OPEN')))
    .orderBy(asc(blackjackTables.createdAt))
    .limit(20);

  for (const t of candidates) {
    try {
      return await joinTable({ userId, tableId: t.id });
    } catch (err) {
      const code = (err as GameError).code;
      if (code === 'TABLE_FULL' || code === 'TABLE_CLOSED' || code === 'UNKNOWN_TABLE') continue;
      throw err;
    }
  }
  return createTable({ userId, isPrivate: false });
}

/**
 * Leaving deletes the player row (the unique seat/user keys make soft-delete
 * a rejoin headache). A live hand mid-round stays in play: the turn deadline
 * auto-stands it, and any payout still lands in the leaver's wallet.
 * The last player out closes the table.
 */
export async function leaveTable(input: { userId: string; tableId: string }) {
  return db.transaction(async (tx) => {
    const table = await lockTable(tx, input.tableId);
    const [gone] = await tx
      .delete(blackjackTablePlayers)
      .where(
        and(
          eq(blackjackTablePlayers.tableId, input.tableId),
          eq(blackjackTablePlayers.userId, input.userId),
        ),
      )
      .returning({ seat: blackjackTablePlayers.seat });
    if (!gone) throw new GameError('NOT_A_MEMBER', 'not seated at this table');

    const events = [await bump(tx, table.id, 'player_left', { userId: input.userId, seat: gone.seat })];

    const remaining = await tx
      .select({ id: blackjackTablePlayers.id })
      .from(blackjackTablePlayers)
      .where(eq(blackjackTablePlayers.tableId, table.id))
      .limit(1);
    if (remaining.length === 0) {
      await tx.update(blackjackTables).set({ status: 'CLOSED' }).where(eq(blackjackTables.id, table.id));
      events.push(await bump(tx, table.id, 'table_closed', {}));
    }
    return { events };
  });
}

export async function setReady(input: { userId: string; tableId: string; ready: boolean }) {
  return db.transaction(async (tx) => {
    await lockTable(tx, input.tableId);
    const [row] = await tx
      .update(blackjackTablePlayers)
      .set({ ready: input.ready })
      .where(
        and(
          eq(blackjackTablePlayers.tableId, input.tableId),
          eq(blackjackTablePlayers.userId, input.userId),
        ),
      )
      .returning({ seat: blackjackTablePlayers.seat });
    if (!row) throw new GameError('NOT_A_MEMBER', 'not seated at this table');
    const events = [
      await bump(tx, input.tableId, 'player_ready', {
        userId: input.userId,
        seat: row.seat,
        ready: input.ready,
      }),
    ];
    return { events };
  });
}

/** Connection flag for the realtime layer. No event, no version bump — presence, not state. */
export async function setConnected(userId: string, tableId: string, connected: boolean) {
  await db
    .update(blackjackTablePlayers)
    .set({ connected })
    .where(
      and(eq(blackjackTablePlayers.tableId, tableId), eq(blackjackTablePlayers.userId, userId)),
    );
}

export async function listPublicTables() {
  const rows = await db
    .select({
      tableId: blackjackTables.id,
      status: blackjackTables.status,
      maxSeats: blackjackTables.maxSeats,
      minWager: blackjackTables.minWager,
      maxWager: blackjackTables.maxWager,
      seated: sql<number>`count(${blackjackTablePlayers.id})::int`,
    })
    .from(blackjackTables)
    .leftJoin(blackjackTablePlayers, eq(blackjackTablePlayers.tableId, blackjackTables.id))
    .where(and(eq(blackjackTables.isPrivate, false), eq(blackjackTables.status, 'OPEN')))
    .groupBy(blackjackTables.id)
    .orderBy(asc(blackjackTables.createdAt));
  return rows;
}

/**
 * The SAFE projection — the only table state a client ever sees.
 * Never the deck. Never the dealer hole card before the dealer's turn.
 * Player cards are face up in blackjack, so every hand's cards are public.
 */
export async function getTableState(tableId: string, userId: string) {
  const [table] = await db.select().from(blackjackTables).where(eq(blackjackTables.id, tableId));
  if (!table) throw new GameError('UNKNOWN_TABLE', 'no such table');

  const players = await db
    .select({
      userId: blackjackTablePlayers.userId,
      seat: blackjackTablePlayers.seat,
      ready: blackjackTablePlayers.ready,
      connected: blackjackTablePlayers.connected,
      displayName: users.displayName,
    })
    .from(blackjackTablePlayers)
    .innerJoin(users, eq(users.id, blackjackTablePlayers.userId))
    .where(eq(blackjackTablePlayers.tableId, tableId))
    .orderBy(asc(blackjackTablePlayers.seat));

  const me = players.find((p) => p.userId === userId);
  if (table.isPrivate && !me) throw new GameError('NOT_A_MEMBER', 'private table');

  const [round] = await db
    .select()
    .from(blackjackRounds)
    .where(eq(blackjackRounds.tableId, tableId))
    .orderBy(desc(blackjackRounds.createdAt))
    .limit(1);

  let roundView = null;
  if (round) {
    const hands = await db
      .select()
      .from(blackjackHands)
      .where(eq(blackjackHands.roundId, round.id))
      .orderBy(asc(blackjackHands.seat));

    const dealerCards = round.dealerCards as Card[];
    // The hole card is the one secret at a blackjack table. It exists from the
    // deal but only ships once the dealer's turn has begun.
    const revealed = round.phase === 'DEALER_TURN' || round.phase === 'SETTLED';
    roundView = {
      id: round.id,
      phase: round.phase,
      dealerCards: revealed ? dealerCards : dealerCards.slice(0, 1),
      activeSeat: round.activeSeat,
      deadlineAt: round.deadlineAt,
      settledAt: round.settledAt,
      hands: hands.map((h) => ({
        seat: h.seat,
        userId: h.userId,
        wager: h.wager,
        doubled: h.doubled,
        cards: h.cards as Card[],
        outcome: h.outcome,
        payout: h.payout,
      })),
    };
  }

  return {
    tableId: table.id,
    status: table.status,
    isPrivate: table.isPrivate,
    roomCode: me ? table.roomCode : null, // members only — the code is the key to a private table
    maxSeats: table.maxSeats,
    minWager: table.minWager,
    maxWager: table.maxWager,
    version: table.version,
    players,
    you: me ? { seat: me.seat, ready: me.ready } : null,
    round: roundView,
  };
}
