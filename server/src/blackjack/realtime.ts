import { EventEmitter } from 'node:events';
import websocket from '@fastify/websocket';
import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AuthError, verifyAccessToken } from '../auth/index.ts';
import { blackjackEvents, blackjackRounds, db } from '../db/index.ts';
import { GameError } from '../games.ts';
import { parseAmount } from '../money.ts';
import { handleTimeout, playerAction, placeBet, startRound } from './round.ts';
import {
  createTable,
  getTableState,
  joinTable,
  leaveTable,
  listPublicTables,
  quickMatch,
  setConnected,
  setReady,
  type BjEvent,
} from './tables.ts';

/**
 * Realtime layer: HTTP commands + WebSocket push.
 *
 * Commands come in over authenticated HTTP (same Bearer token as the rest of
 * the API); the WebSocket is for events out. A client that missed events sends
 * `{type:'subscribe', tableId, afterSeq}` and receives everything after that
 * seq from the blackjack_events log, then goes live — no polling.
 *
 * TODO(multi-instance): fan-out is an in-process EventEmitter and timers are
 * in-process setTimeouts. Running >1 server instance needs Postgres
 * LISTEN/NOTIFY (or Redis pub/sub) for events, and an advisory lock or leader
 * election for the deadline timers. Deliberately not built for the prototype.
 */

const bus = new EventEmitter();
bus.setMaxListeners(0);

const timers = new Map<string, NodeJS.Timeout>();

function clearDeadline(tableId: string) {
  const t = timers.get(tableId);
  if (t) clearTimeout(t);
  timers.delete(tableId);
}

/**
 * Arm the table's deadline timer. The timestamp on the round is the source of
 * truth; this setTimeout is just the poke that makes the server look at it —
 * which is why a restart can recover by re-arming from the DB (see onReady).
 */
function scheduleDeadline(app: FastifyInstance, tableId: string, at: Date) {
  clearDeadline(tableId);
  const ms = Math.max(0, at.getTime() - Date.now());
  const t = setTimeout(async () => {
    timers.delete(tableId);
    try {
      const { events } = await handleTimeout(tableId);
      publish(app, events);
    } catch (err) {
      app.log.error({ err }, 'blackjack timeout handler failed');
    }
  }, ms + 250); // small grace so a command racing the deadline wins cleanly
  t.unref?.();
  timers.set(tableId, t);
}

function publish(app: FastifyInstance, events: BjEvent[]) {
  for (const e of events) {
    bus.emit(`table:${e.tableId}`, e);
    const deadline = (e.payload as { deadlineAt?: unknown }).deadlineAt;
    if (typeof deadline === 'string') scheduleDeadline(app, e.tableId, new Date(deadline));
    if (e.type === 'round_settled' || e.type === 'round_cancelled' || e.type === 'table_closed') {
      clearDeadline(e.tableId);
    }
  }
}

const STATUS: Record<string, number> = {
  INVALID_INPUT: 400,
  INVALID_AMOUNT: 400,
  ILLEGAL_ACTION: 400,
  UNKNOWN_CREDIT_TYPE: 400,
  UNKNOWN_TABLE: 404,
  NOT_A_MEMBER: 403,
  BAD_PHASE: 409,
  NOT_READY: 409,
  ALREADY_BET: 409,
  DUPLICATE_COMMAND: 409,
  OUT_OF_TURN: 409,
  INSUFFICIENT_BALANCE: 409,
  NO_WALLET: 409,
  TABLE_FULL: 409,
  TABLE_CLOSED: 410,
};

const uuid = z.string().uuid();
const amount = z.string().transform((v, ctx) => {
  try {
    return parseAmount(v);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'not a valid amount' });
    return z.NEVER;
  }
});

const createBody = z.object({ isPrivate: z.boolean().optional() });
const joinBody = z
  .object({ tableId: uuid.optional(), roomCode: z.string().min(4).max(8).optional() })
  .refine((b) => b.tableId || b.roomCode, { message: 'tableId or roomCode required' });
const readyBody = z.object({ ready: z.boolean() });
const startBody = z.object({ commandId: uuid });
const betBody = z.object({ commandId: uuid, amount });
const actionBody = z.object({ commandId: uuid, action: z.enum(['hit', 'stand', 'double']) });
const tableParams = z.object({ tableId: uuid });

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new GameError('INVALID_INPUT', result.error.issues[0]?.message ?? 'bad input');
  return result.data;
}

async function requireAuth(req: FastifyRequest) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new AuthError('INVALID_TOKEN');
  req.userId = verifyAccessToken(header.slice(7)).sub;
}

/** Registers the blackjack HTTP command routes and the /ws/blackjack socket. */
export async function registerBlackjack(app: FastifyInstance) {
  await app.register(websocket);

  await app.register(async (bj) => {
    bj.setErrorHandler((error, request, reply) => {
      if (error instanceof AuthError) return reply.status(401).send({ error: error.code });
      const code = (error as GameError).code;
      const status = typeof code === 'string' ? STATUS[code] : undefined;
      if (status) return reply.status(status).send({ error: code });
      request.log.error({ err: error, cause: (error as Error).cause }, 'blackjack error');
      return reply.status(500).send({ error: 'INTERNAL_ERROR' });
    });

    // ------------------------------------------------------------- lobby
    bj.get('/blackjack/tables', { preHandler: requireAuth }, async () => ({
      tables: await listPublicTables(),
    }));

    bj.post('/blackjack/tables', { preHandler: requireAuth }, async (req) => {
      const { isPrivate } = parse(createBody, req.body ?? {});
      const result = await createTable({ userId: req.userId, isPrivate });
      publish(bj, result.events);
      return result;
    });

    bj.post('/blackjack/quickmatch', { preHandler: requireAuth }, async (req) => {
      const result = await quickMatch(req.userId);
      publish(bj, result.events);
      return result;
    });

    bj.post('/blackjack/join', { preHandler: requireAuth }, async (req) => {
      const body = parse(joinBody, req.body ?? {});
      const result = await joinTable({ userId: req.userId, ...body });
      publish(bj, result.events);
      return result;
    });

    // ------------------------------------------------------------- table
    bj.get('/blackjack/tables/:tableId', { preHandler: requireAuth }, async (req) => {
      const { tableId } = parse(tableParams, req.params);
      return getTableState(tableId, req.userId);
    });

    bj.post('/blackjack/tables/:tableId/leave', { preHandler: requireAuth }, async (req) => {
      const { tableId } = parse(tableParams, req.params);
      const result = await leaveTable({ userId: req.userId, tableId });
      publish(bj, result.events);
      return { ok: true };
    });

    bj.post('/blackjack/tables/:tableId/ready', { preHandler: requireAuth }, async (req) => {
      const { tableId } = parse(tableParams, req.params);
      const { ready } = parse(readyBody, req.body ?? {});
      const result = await setReady({ userId: req.userId, tableId, ready });
      publish(bj, result.events);
      return { ok: true };
    });

    // ------------------------------------------------------------- round
    bj.post('/blackjack/tables/:tableId/start', { preHandler: requireAuth }, async (req) => {
      const { tableId } = parse(tableParams, req.params);
      const { commandId } = parse(startBody, req.body ?? {});
      // Note: no deck passthrough — the shoe is always shuffled server-side.
      const result = await startRound({ userId: req.userId, tableId, commandId });
      publish(bj, result.events);
      return { roundId: result.roundId };
    });

    bj.post('/blackjack/tables/:tableId/bet', { preHandler: requireAuth }, async (req) => {
      const { tableId } = parse(tableParams, req.params);
      const { commandId, amount: wager } = parse(betBody, req.body ?? {});
      const result = await placeBet({ userId: req.userId, tableId, commandId, amount: wager });
      publish(bj, result.events);
      return { roundId: result.roundId, balance: result.balance, duplicate: result.duplicate };
    });

    bj.post('/blackjack/tables/:tableId/action', { preHandler: requireAuth }, async (req) => {
      const { tableId } = parse(tableParams, req.params);
      const { commandId, action } = parse(actionBody, req.body ?? {});
      const result = await playerAction({ userId: req.userId, tableId, commandId, action });
      publish(bj, result.events);
      return { ok: true };
    });

    // ------------------------------------------------------------- websocket
    // Structural socket type: @types/ws is not installed, and the four members
    // below are all this handler touches.
    type Socket = {
      readyState: number;
      OPEN: number;
      send: (data: string) => void;
      close: (code?: number, reason?: string) => void;
      on(event: 'message', cb: (raw: Buffer) => void): void;
      on(event: 'close', cb: () => void): void;
    };

    bj.get('/ws/blackjack', { websocket: true }, (socket: Socket, req: FastifyRequest) => {
      let userId: string;
      try {
        // Token comes from the Authorization header only. The mobile client sets
        // it via RN's WebSocket options; a ?token= query param was removed
        // because it lands in access/proxy logs — never put a credential in a URL.
        // A browser client (which can't set WS headers) would need a short-lived
        // single-use ticket endpoint; out of scope for the mobile-first prototype.
        const header = req.headers.authorization ?? '';
        if (!header.startsWith('Bearer ')) throw new AuthError('INVALID_TOKEN');
        userId = verifyAccessToken(header.slice(7)).sub;
      } catch {
        socket.close(4401, 'unauthorized');
        return;
      }

      const subs = new Map<string, (e: BjEvent) => void>();

      const subscribe = async (tableId: string, afterSeq: number) => {
        if (subs.has(tableId)) return;
        // Throws for private tables the user is not seated at.
        const state = await getTableState(tableId, userId);

        // Attach the live listener BEFORE backfilling and buffer while the
        // backfill runs, so no event can fall into the gap between the two.
        let backfilling = true;
        let lastSent = afterSeq;
        const buffer: BjEvent[] = [];
        const send = (e: BjEvent) => {
          if (e.version > lastSent && socket.readyState === socket.OPEN) {
            lastSent = e.version;
            socket.send(JSON.stringify(e));
          }
        };
        const listener = (e: BjEvent) => (backfilling ? buffer.push(e) : send(e));
        bus.on(`table:${tableId}`, listener);
        subs.set(tableId, listener);

        const missed = await db
          .select()
          .from(blackjackEvents)
          .where(and(eq(blackjackEvents.tableId, tableId), gt(blackjackEvents.seq, afterSeq)))
          .orderBy(asc(blackjackEvents.seq));
        for (const row of missed) {
          send({
            type: row.type,
            tableId,
            version: row.seq,
            ts: row.createdAt.toISOString(),
            payload: row.payload as Record<string, unknown>,
          });
        }
        // A full safe snapshot after the replay, so clients can also just
        // reset from state instead of folding every event.
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'state',
              tableId,
              version: state.version,
              ts: new Date().toISOString(),
              payload: state,
            }),
          );
        }
        backfilling = false;
        for (const e of buffer) send(e);
        await setConnected(userId, tableId, true).catch(() => {});
      };

      socket.on('message', async (raw: Buffer) => {
        try {
          const msg = JSON.parse(String(raw)) as { type?: string; tableId?: string; afterSeq?: number };
          if (msg.type === 'subscribe' && typeof msg.tableId === 'string') {
            await subscribe(msg.tableId, Number(msg.afterSeq ?? 0) || 0);
          } else {
            socket.send(JSON.stringify({ type: 'error', payload: { error: 'BAD_MESSAGE' } }));
          }
        } catch (err) {
          const code = (err as GameError).code ?? 'BAD_MESSAGE';
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: 'error', payload: { error: code } }));
          }
        }
      });

      socket.on('close', () => {
        for (const [tableId, listener] of subs) {
          bus.off(`table:${tableId}`, listener);
          void setConnected(userId, tableId, false).catch(() => {});
        }
        subs.clear();
      });
    });

    // Re-arm persisted deadlines after a restart: the timestamps survived in
    // blackjack_rounds even though the setTimeouts died with the old process.
    bj.addHook('onReady', async () => {
      const pending = await db
        .select({ tableId: blackjackRounds.tableId, deadlineAt: blackjackRounds.deadlineAt })
        .from(blackjackRounds)
        .where(and(isNull(blackjackRounds.settledAt), isNotNull(blackjackRounds.deadlineAt)));
      for (const r of pending) scheduleDeadline(bj, r.tableId, r.deadlineAt!);
    });

    bj.addHook('onClose', async () => {
      for (const tableId of [...timers.keys()]) clearDeadline(tableId);
    });
  });
}
