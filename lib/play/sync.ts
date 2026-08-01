/**
 * Mirrors Play rounds into the backend ledger.
 *
 * The local balance in balanceStore stays the source of truth for the UI — games
 * must not wait on a network round trip mid-animation. Every wager and settle is
 * queued here and flushed in the background.
 *
 * The queue is strictly FIFO and never skips a failed job. A settle overtaking
 * its own wager would credit a player who, as far as the ledger knows, never
 * staked anything. Order is the whole point; throughput is not.
 *
 * The server settles from what we tell it. It is not refereeing the game — see
 * the note at the top of server/src/games.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, apiFetch } from '../api';
import type { GameId } from './types';

const QUEUE_KEY = 'play:syncQueue:v1';

type Job =
  | { kind: 'wager'; roundId: string; stakeId: string; gameId: GameId; amount: string }
  | {
      kind: 'settle';
      roundId: string;
      outcome: 'WIN' | 'LOSS' | 'PUSH';
      payout: string;
      label?: string;
    }
  | { kind: 'faucet'; amount: string };

let queue: Job[] = [];
let loadPromise: Promise<void> | null = null;
let flushing = false;

/** Tokens are 2dp floats on the client; the ledger is numeric(18,4). */
const toAmount = (tokens: number): string => Math.max(0, tokens).toFixed(4);

/**
 * Merges anything left on disk by a previous run. Jobs already queued in memory
 * keep their order and go behind the older ones — the disk holds rounds that
 * happened first.
 */
function load(): Promise<void> {
  loadPromise ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) queue = [...(JSON.parse(raw) as Job[]), ...queue];
    } catch {
      // Unreadable queue: carry on with whatever is in memory.
    }
  })();
  return loadPromise;
}

async function persist() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // An unpersisted queue still flushes this session; only a kill loses it.
  }
}

async function send(job: Job): Promise<void> {
  if (job.kind === 'wager') {
    await apiFetch(`/games/${job.gameId}/wager`, {
      method: 'POST',
      body: JSON.stringify({ roundId: job.roundId, stakeId: job.stakeId, amount: job.amount }),
    });
  } else if (job.kind === 'settle') {
    await apiFetch(`/games/rounds/${job.roundId}/settle`, {
      method: 'POST',
      body: JSON.stringify({ outcome: job.outcome, payout: job.payout, label: job.label }),
    });
  } else {
    await apiFetch('/faucet', { method: 'POST', body: JSON.stringify({ amount: job.amount }) });
  }
}

/**
 * A 4xx other than 401 means the server will never accept this job — a replay it
 * has already applied, or a round it does not recognise. Retrying forever would
 * wedge the queue behind it, so it is dropped. Everything else (offline, 5xx,
 * an expired session) is transient and keeps its place in line.
 */
const isPermanent = (e: unknown) =>
  e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401;

export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await load();
    while (queue.length) {
      const job = queue[0];
      try {
        await send(job);
      } catch (e) {
        if (!isPermanent(e)) return; // stop; order must hold
      }
      queue.shift();
      await persist();
    }
  } finally {
    flushing = false;
  }
}

/**
 * The push is synchronous and deliberately so. Awaiting anything first lets a
 * later call land ahead of an earlier one — a settle jumping its own wager —
 * because the awaits resolve out of order. Persisting can happen whenever.
 */
function enqueue(job: Job) {
  queue.push(job);
  void (async () => {
    await load();
    await persist();
    void flush();
  })();
}

/** Number of rounds not yet mirrored to the server. Drives the "not syncing" hint. */
export async function pendingCount(): Promise<number> {
  await load();
  return queue.length;
}

// --------------------------------------------------------------- round tracking

/**
 * The round currently open on screen. Only one game is ever visible, and each
 * screen guards its own double-settle, so a single slot is enough — no roundId
 * has to be threaded through five components' state.
 */
let openRoundId: string | null = null;

/** Call when the stake is taken. Returns the round id the settle will use. */
export function beginRound(gameId: GameId, wager: number): string {
  const roundId = randomUuid();
  openRoundId = roundId;
  enqueue({ kind: 'wager', roundId, stakeId: randomUuid(), gameId, amount: toAmount(wager) });
  return roundId;
}

/**
 * An extra stake on the round already open — blackjack's double down. Its own
 * stakeId keeps it distinct from a retry of the opening bet.
 */
export function addStake(gameId: GameId, wager: number) {
  if (!openRoundId) return;
  enqueue({
    kind: 'wager',
    roundId: openRoundId,
    stakeId: randomUuid(),
    gameId,
    amount: toAmount(wager),
  });
}

/**
 * Call when the round resolves. `payout` is the total returned including the
 * stake, matching payouts.ts — so a lost round is 0, a push is the wager back.
 */
export function endRound(args: {
  outcome: 'WIN' | 'LOSS' | 'PUSH';
  payout: number;
  label?: string;
  roundId?: string;
}) {
  const roundId = args.roundId ?? openRoundId;
  // No open round means the wager never went through this path (a screen
  // reloaded mid-game, say). Nothing to settle server-side.
  if (!roundId) return;
  openRoundId = null;
  enqueue({
    kind: 'settle',
    roundId,
    outcome: args.outcome,
    payout: toAmount(args.payout),
    label: args.label,
  });
}

export function claimFaucet(amount: number) {
  enqueue({ kind: 'faucet', amount: toAmount(amount) });
}

/** Hermes exposes crypto.randomUUID, but the fallback keeps tests off native modules. */
function randomUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Test seam: drop in-memory state so each case starts clean. */
export function __resetForTests() {
  queue = [];
  loadPromise = null;
  flushing = false;
  openRoundId = null;
}
