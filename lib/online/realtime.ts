/**
 * WebSocket client for online play.
 *
 * One socket for the whole app, shared by every table subscription. It
 * reconnects with exponential backoff, and on every (re)connect tells the
 * server the last seq/version it saw per table so missed events are replayed.
 * Events are deduped by (tableId, version): anything at or below the last
 * seen version is dropped before handlers run, so a replayed backlog cannot
 * double-apply.
 *
 * The client renders server state only — nothing here computes game results.
 */

import { getAccessToken } from '../api';
import { WS_URL } from './config';

export type ServerEvent = {
  type: string;
  tableId: string;
  roundId?: string;
  version: number;
  ts?: string;
  payload?: unknown;
};

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

type Handler = (event: ServerEvent) => void;

/** React Native's WebSocket takes a third options arg (headers); lib.dom's type does not. */
type RNWebSocketCtor = new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers?: Record<string, string> },
) => WebSocket;

const OPEN = 1;
const MAX_BACKOFF_MS = 15_000;

const subs = new Map<string, Set<Handler>>();
const lastSeen = new Map<string, number>();
const statusListeners = new Set<(s: ConnectionStatus) => void>();

let socket: WebSocket | null = null;
let status: ConnectionStatus = 'idle';
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on disconnect so a token fetch in flight cannot resurrect a dead connection. */
let generation = 0;

function setStatus(next: ConnectionStatus) {
  if (status === next) return;
  status = next;
  for (const fn of [...statusListeners]) fn(next);
}

export function getStatus(): ConnectionStatus {
  return status;
}

export function onStatus(fn: (s: ConnectionStatus) => void): () => void {
  statusListeners.add(fn);
  return () => void statusListeners.delete(fn);
}

const subscribeMessage = (tableId: string) =>
  JSON.stringify({ type: 'subscribe', tableId, afterSeq: lastSeen.get(tableId) ?? 0 });

async function connect() {
  if (socket || subs.size === 0) return;
  const gen = generation;
  setStatus(attempts === 0 ? 'connecting' : 'reconnecting');

  const token = await getAccessToken().catch(() => null);
  if (gen !== generation || socket || subs.size === 0) return;

  const WS = globalThis.WebSocket as unknown as RNWebSocketCtor;
  const ws = new WS(WS_URL, null, token ? { headers: { authorization: `Bearer ${token}` } } : {});
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;
    attempts = 0;
    setStatus('open');
    // Resubscribe everything, asking for the events missed while offline.
    for (const tableId of subs.keys()) ws.send(subscribeMessage(tableId));
  };

  ws.onmessage = (msg) => {
    if (socket !== ws) return;
    let event: ServerEvent;
    try {
      event = JSON.parse(String((msg as { data: unknown }).data));
    } catch {
      return;
    }
    if (!event || typeof event.tableId !== 'string' || typeof event.version !== 'number') return;

    const seen = lastSeen.get(event.tableId) ?? 0;
    if (event.version <= seen) return; // duplicate or already applied
    lastSeen.set(event.tableId, event.version);

    const handlers = subs.get(event.tableId);
    if (handlers) for (const h of [...handlers]) h(event);
  };

  ws.onerror = () => {
    // onclose always follows in RN; reconnect is handled there.
  };

  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (subs.size === 0) {
      setStatus('idle');
      return;
    }
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  setStatus('reconnecting');
  const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts);
  attempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

function disconnect() {
  generation += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  attempts = 0;
  const ws = socket;
  socket = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  setStatus('idle');
}

/**
 * Streams events for one table. The first subscription opens the socket; the
 * last unsubscribe closes it. Call the returned function on unmount.
 */
export function subscribeTable(tableId: string, handler: Handler): () => void {
  let handlers = subs.get(tableId);
  if (!handlers) {
    handlers = new Set();
    subs.set(tableId, handlers);
    if (socket?.readyState === OPEN) socket.send(subscribeMessage(tableId));
  }
  handlers.add(handler);
  void connect();

  return () => {
    const set = subs.get(tableId);
    if (!set) return;
    set.delete(handler);
    if (set.size > 0) return;
    subs.delete(tableId);
    lastSeen.delete(tableId);
    if (subs.size === 0) disconnect();
  };
}

/** Sends when the socket is open. Returns false otherwise so callers can disable UI. */
export function sendMessage(message: object): boolean {
  if (!socket || socket.readyState !== OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

/**
 * Sets the dedupe baseline after a full-state fetch, so replayed events the
 * snapshot already includes are dropped instead of applied twice.
 */
export function noteVersion(tableId: string, version: number) {
  if ((lastSeen.get(tableId) ?? 0) < version) lastSeen.set(tableId, version);
}

/** Hermes exposes crypto.randomUUID, but the fallback keeps tests off native modules. */
export function randomUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Test seam: drop all connection state so each case starts clean. */
export function __resetForTests() {
  disconnect();
  subs.clear();
  lastSeen.clear();
  statusListeners.clear();
  status = 'idle';
}
