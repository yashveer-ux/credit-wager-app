import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => 'access-1',
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

/** Stand-in for React Native's WebSocket (url, protocols, { headers }). */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  protocols: unknown;
  options: { headers?: Record<string, string> } | undefined;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string, protocols?: unknown, options?: { headers?: Record<string, string> }) {
    this.url = url;
    this.protocols = protocols;
    this.options = options;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  // -- test drivers ----------------------------------------------------------
  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  message(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  /** A server-side drop, as opposed to a client-initiated close(). */
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

(globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;

// Loaded with require, not import: it must resolve after the mocks above.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const realtime = require('./realtime') as typeof import('./realtime');

/** connect() awaits the token fetch; this flushes those microtasks under fake timers. */
const flush = () => jest.advanceTimersByTimeAsync(0);

const event = (tableId: string, version: number, payload: object = {}) => ({
  type: 'state',
  tableId,
  version,
  ts: 'now',
  payload,
});

const sentJson = (ws: FakeWebSocket) => ws.sent.map((s) => JSON.parse(s));

beforeEach(() => {
  jest.useFakeTimers();
  realtime.__resetForTests();
  FakeWebSocket.instances.length = 0;
});

afterEach(() => {
  realtime.__resetForTests();
  jest.useRealTimers();
});

describe('realtime client', () => {
  it('connects with the bearer token and subscribes with afterSeq 0', async () => {
    realtime.subscribeTable('t1', () => {});
    await flush();

    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws.options?.headers?.authorization).toBe('Bearer access-1');

    ws.open();
    expect(sentJson(ws)).toEqual([{ type: 'subscribe', tableId: 't1', afterSeq: 0 }]);
    expect(realtime.getStatus()).toBe('open');
  });

  it('delivers events in order and dedupes by (tableId, version)', async () => {
    const seen: number[] = [];
    realtime.subscribeTable('t1', (e) => seen.push(e.version));
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.message(event('t1', 1));
    ws.message(event('t1', 1)); // duplicate
    ws.message(event('t1', 2));
    ws.message(event('t1', 2)); // duplicate
    ws.message(event('t1', 0)); // older than anything seen
    ws.message(event('other-table', 9)); // not ours

    expect(seen).toEqual([1, 2]);
  });

  it('drops replayed events at or below the noteVersion baseline', async () => {
    const seen: number[] = [];
    realtime.subscribeTable('t1', (e) => seen.push(e.version));
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    // The snapshot fetch already contained version 5.
    realtime.noteVersion('t1', 5);
    ws.message(event('t1', 4));
    ws.message(event('t1', 5));
    ws.message(event('t1', 6));

    expect(seen).toEqual([6]);
  });

  it('reconnects after a drop and asks for events missed since the last seq', async () => {
    const seen: number[] = [];
    realtime.subscribeTable('t1', (e) => seen.push(e.version));
    await flush();
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    ws1.message(event('t1', 3));

    ws1.drop();
    expect(realtime.getStatus()).toBe('reconnecting');

    await jest.advanceTimersByTimeAsync(1000);
    const ws2 = FakeWebSocket.instances[1];
    expect(ws2).toBeDefined();
    ws2.open();

    // Resubscribed with the last seq it saw, so the server can replay the gap.
    expect(sentJson(ws2)).toEqual([{ type: 'subscribe', tableId: 't1', afterSeq: 3 }]);

    // A replay of 3 is dropped; the missed 4 comes through.
    ws2.message(event('t1', 3));
    ws2.message(event('t1', 4));
    expect(seen).toEqual([3, 4]);
    expect(realtime.getStatus()).toBe('open');
  });

  it('backs off exponentially while the server stays down', async () => {
    realtime.subscribeTable('t1', () => {});
    await flush();

    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].drop();

    // First retry after 1s… and it fails too.
    await jest.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].drop();

    // Second retry waits 2s, not 1s.
    await jest.advanceTimersByTimeAsync(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('only sends when the socket is open', async () => {
    expect(realtime.sendMessage({ type: 'command' })).toBe(false);

    realtime.subscribeTable('t1', () => {});
    await flush();
    const ws = FakeWebSocket.instances[0];
    expect(realtime.sendMessage({ type: 'command' })).toBe(false); // not open yet

    ws.open();
    expect(realtime.sendMessage({ type: 'command', action: 'hit' })).toBe(true);
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: 'command', action: 'hit' });
  });

  it('closes the socket and stops reconnecting after the last unsubscribe', async () => {
    const unsubscribe = realtime.subscribeTable('t1', () => {});
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    unsubscribe();
    expect(ws.readyState).toBe(3);
    expect(realtime.getStatus()).toBe('idle');

    // No timer left behind to resurrect the connection.
    await jest.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('keeps one socket across multiple table subscriptions', async () => {
    realtime.subscribeTable('t1', () => {});
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();

    const off2 = realtime.subscribeTable('t2', () => {});
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(sentJson(ws).map((m) => m.tableId)).toEqual(['t1', 't2']);

    // Dropping only one table keeps the socket for the other.
    off2();
    expect(ws.readyState).toBe(1);
  });
});
