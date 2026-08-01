/**
 * Client for server-authoritative multiplayer blackjack.
 *
 * REST creates/joins/leaves tables and fetches full snapshots; player commands
 * travel over the WebSocket with a commandId; state updates arrive as realtime
 * events. The client never computes cards, winners, or payouts — it renders
 * whatever the server says, and on any version gap it refetches the snapshot.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiFetch } from '../api';
import {
  getStatus,
  noteVersion,
  onStatus,
  randomUuid,
  subscribeTable,
  type ConnectionStatus,
  type ServerEvent,
} from './realtime';

// ------------------------------------------------------------------- types
// Shapes follow the planned backend contract; the lead reconciles drift.

export type OnlineCard = { rank: string; suit: string; hidden?: boolean };

export type SeatView = {
  index: number;
  player: { id: string; displayName: string; avatarEmoji?: string } | null;
  ready?: boolean;
  bet?: number | null;
  cards?: OnlineCard[];
  total?: number | null;
  result?: 'win' | 'loss' | 'push' | 'blackjack' | null;
  payout?: number | null;
};

export type TableState = {
  id: string;
  code?: string;
  visibility?: 'public' | 'private';
  status: 'waiting' | 'betting' | 'playing' | 'settled' | string;
  version: number;
  roundId?: string;
  seats: SeatView[];
  dealer: { cards: OnlineCard[]; total?: number | null; holeHidden?: boolean };
  activeSeat?: number | null;
  /** ISO deadline for the active player's move; the client only renders it. */
  turnDeadline?: string | null;
  /** ISO time the next round starts, once a round has settled. */
  nextRoundAt?: string | null;
  minBet?: number;
  maxBet?: number;
};

export type TableSummary = {
  id: string;
  name?: string;
  players?: number;
  maxPlayers?: number;
  minBet?: number;
  status?: string;
};

type AnyBody = Record<string, unknown>;

/** Tolerates `{ table: {...} }` vs bare bodies until the lead pins the shape. */
const unwrap = (body: AnyBody): AnyBody => (body.table as AnyBody) ?? (body.state as AnyBody) ?? body;
const idOf = (body: AnyBody): string => String(unwrap(body).id ?? unwrap(body).tableId ?? '');

// ------------------------------------------------------------------- REST

export async function listTables(): Promise<TableSummary[]> {
  const body = (await apiFetch('/blackjack/tables')) as AnyBody;
  return (body.tables ?? body) as TableSummary[];
}

export async function createTable(visibility: 'public' | 'private'): Promise<{ id: string; code?: string }> {
  const body = (await apiFetch('/blackjack/tables', {
    method: 'POST',
    body: JSON.stringify({ isPrivate: visibility === 'private' }),
  })) as AnyBody;
  return { id: idOf(body), code: unwrap(body).roomCode as string | undefined };
}

export async function quickMatch(): Promise<string> {
  const body = (await apiFetch('/blackjack/quickmatch', { method: 'POST' })) as AnyBody;
  return idOf(body);
}

/** Joins by table id, or by room code for private tables. */
export async function joinTable(idOrCode: string): Promise<string> {
  // A room code is short and not a UUID; anything else is treated as a table id.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  const body = (await apiFetch('/blackjack/join', {
    method: 'POST',
    body: JSON.stringify(isUuid ? { tableId: idOrCode } : { roomCode: idOrCode }),
  })) as AnyBody;
  return idOf(body) || idOrCode;
}

export const leaveTable = (id: string) =>
  apiFetch(`/blackjack/tables/${encodeURIComponent(id)}/leave`, { method: 'POST' });

export async function getTableState(id: string): Promise<TableState> {
  const body = (await apiFetch(`/blackjack/tables/${encodeURIComponent(id)}`)) as AnyBody;
  return unwrap(body) as unknown as TableState;
}

/**
 * Server wallet balance, the only balance online play may show. The local
 * demo balanceStore is single-player-only and never consulted here.
 */
export async function getTokenBalance(): Promise<number> {
  const body = (await apiFetch('/wallets')) as AnyBody;
  const wallets = (body.wallets ?? body) as { code?: string; creditType?: string; balance: string | number }[];
  if (!Array.isArray(wallets) || wallets.length === 0) return 0;
  // ponytail: token wallet picked by code heuristic; lead pins the exact code.
  const wallet = wallets.find((w) => /TOKEN/i.test(String(w.code ?? w.creditType ?? ''))) ?? wallets[0];
  const n = Number(wallet.balance);
  return Number.isFinite(n) ? n : 0;
}

/** Maps an error to copy the screens can show. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'SESSION_EXPIRED':
        return 'Your session expired. Please sign in again.';
      case 'INSUFFICIENT_BALANCE':
        return 'Not enough tokens for that.';
      case 'TABLE_FULL':
        return 'That table is full.';
      case 'NOT_FOUND':
        return 'That table no longer exists.';
      default:
        return e.status >= 500 ? 'The server hit a problem. Try again.' : `Request failed (${e.code}).`;
    }
  }
  return 'Cannot reach the server. Check your connection and try again.';
}

// ------------------------------------------------------------- event logic

/**
 * Applies one realtime event to the current snapshot. Returns the next state,
 * the same state for stale events, or null when a full resync is needed —
 * a version gap, or a payload we cannot merge.
 */
export function applyEvent(state: TableState | null, event: ServerEvent): TableState | null {
  if (!state) return null;
  if (event.version <= state.version) return state; // stale; already in the snapshot
  const patch = event.payload as Partial<TableState> | null | undefined;
  if (event.version !== state.version + 1 || !patch || typeof patch !== 'object') return null;
  return { ...state, ...patch, id: state.id, version: event.version };
}

// -------------------------------------------------------------------- hook

export type PlayerAction = 'bet' | 'hit' | 'stand' | 'double' | 'ready';

export type BlackjackTable = {
  state: TableState | null;
  /** Error code/copy for the last failed snapshot fetch; null once one succeeds. */
  error: string | null;
  loading: boolean;
  connection: ConnectionStatus;
  /** True between a sent command and the next server event. Disables controls. */
  inFlight: boolean;
  refresh: () => Promise<void>;
  /** Sends a player command over the socket. False when disconnected. */
  sendAction: (action: PlayerAction, extra?: Record<string, unknown>) => boolean;
};

const COMMAND_TIMEOUT_MS = 6_000;

export function useBlackjackTable(tableId: string): BlackjackTable {
  const [state, setState] = useState<TableState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionStatus>(getStatus());
  const [inFlight, setInFlight] = useState(false);

  const stateRef = useRef<TableState | null>(null);
  // Mirror state into a ref for use inside callbacks/timers, in an effect rather
  // than during render (writing a ref in render is a compiler-flagged hazard).
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const resyncing = useRef(false);
  const inFlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInFlight = useCallback(() => {
    if (inFlightTimer.current) clearTimeout(inFlightTimer.current);
    inFlightTimer.current = null;
    setInFlight(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await getTableState(tableId);
      noteVersion(tableId, next.version);
      setState(next);
      setError(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    // Resetting for a new tableId then fetching; the async state lands after the
    // effect runs, which the compiler rule can't see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setState(null);
    void refresh();

    const offEvents = subscribeTable(tableId, (event) => {
      clearInFlight();
      const next = applyEvent(stateRef.current, event);
      if (next) {
        setState(next);
        return;
      }
      // Version gap (or nothing to merge onto): the snapshot is authoritative.
      if (!resyncing.current) {
        resyncing.current = true;
        void refresh().finally(() => {
          resyncing.current = false;
        });
      }
    });
    const offStatus = onStatus(setConnection);

    return () => {
      offEvents();
      offStatus();
      if (inFlightTimer.current) clearTimeout(inFlightTimer.current);
    };
  }, [tableId, refresh, clearInFlight]);

  const sendAction = useCallback(
    (action: PlayerAction, extra?: Record<string, unknown>) => {
      // Commands go over HTTP (the WebSocket is events-out only); the server
      // pushes the resulting state change back through the socket. Each carries
      // a commandId so a retry is idempotent server-side.
      const commandId = randomUuid();
      let path: string;
      let body: Record<string, unknown>;
      if (action === 'ready') {
        path = `/blackjack/tables/${tableId}/ready`;
        body = { ready: extra?.ready ?? true };
      } else if (action === 'bet') {
        path = `/blackjack/tables/${tableId}/bet`;
        body = { commandId, amount: extra?.amount };
      } else {
        // hit / stand / double
        path = `/blackjack/tables/${tableId}/action`;
        body = { commandId, action };
      }

      setInFlight(true);
      if (inFlightTimer.current) clearTimeout(inFlightTimer.current);
      // A lost command must not wedge the controls forever.
      inFlightTimer.current = setTimeout(() => setInFlight(false), COMMAND_TIMEOUT_MS);

      apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
        .catch(() => {}) // errors surface via the next state push or the timeout
        .finally(() => clearInFlight());
      return true;
    },
    [tableId, clearInFlight],
  );

  return { state, error, loading, connection, inFlight, refresh, sendAction };
}
