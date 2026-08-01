import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDisk = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockDisk.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockDisk.set(k, v),
    removeItem: async (k: string) => void mockDisk.delete(k),
  },
}));

type Call = { path: string; body: Record<string, unknown> };
const mockCalls: Call[] = [];
let mockFail: ((path: string) => { status: number } | null) | null = null;

class MockApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

jest.mock('../api', () => ({
  ApiError: MockApiError,
  apiFetch: async (path: string, init: { body: string }) => {
    const failure = mockFail?.(path);
    if (failure) throw new MockApiError(failure.status, 'NOPE');
    mockCalls.push({ path, body: JSON.parse(init.body) });
    return {};
  },
}));

// Loaded with require, not import: it must resolve after jest.mock above,
// and an ESM import would be hoisted past it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sync = require('./sync') as typeof import('./sync');

/** enqueue is fire-and-forget; let its promise chain settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockDisk.clear();
  mockCalls.length = 0;
  mockFail = null;
  sync.__resetForTests();
});

describe('play sync queue', () => {
  it('sends a wager then its settle, in that order', async () => {
    sync.beginRound('crash', 100);
    sync.endRound({ outcome: 'WIN', payout: 250 });
    await settle();

    expect(mockCalls.map((c) => c.path)).toEqual([
      '/games/crash/wager',
      expect.stringMatching(/^\/games\/rounds\/[0-9a-f-]{36}\/settle$/),
    ]);
    // Same round, and amounts carried at the ledger's 4dp scale.
    expect(mockCalls[0].body.amount).toBe('100.0000');
    expect(mockCalls[1].body).toMatchObject({ outcome: 'WIN', payout: '250.0000' });
    expect(mockCalls[1].path).toContain(String(mockCalls[0].body.roundId));
  });

  /**
   * The property the whole queue exists for. A settle reaching the server
   * before its wager would credit a player who never staked anything.
   */
  it('never sends a settle before its wager, even when the wager fails first', async () => {
    let wagerAttempts = 0;
    mockFail = (path) => {
      if (path.endsWith('/wager') && wagerAttempts++ === 0) return { status: 503 };
      return null;
    };

    sync.beginRound('crash', 100);
    sync.endRound({ outcome: 'WIN', payout: 250 });
    await settle();

    // First flush stalled on the failing wager: nothing may have gone through.
    expect(mockCalls).toHaveLength(0);
    expect(await sync.pendingCount()).toBe(2);

    await sync.flush();
    expect(mockCalls.map((c) => c.path.split('/').pop())).toEqual(['wager', 'settle']);
  });

  it('keeps unsent jobs so a later flush can retry them', async () => {
    mockFail = () => ({ status: 500 });
    sync.beginRound('roulette', 50);
    await settle();
    expect(await sync.pendingCount()).toBe(1);

    mockFail = null;
    await sync.flush();
    expect(mockCalls).toHaveLength(1);
    expect(await sync.pendingCount()).toBe(0);
  });

  it('drops a job the server will never accept, rather than wedging the queue', async () => {
    // 404 on the settle: that round does not exist and never will.
    mockFail = (path) => (path.endsWith('/settle') ? { status: 404 } : null);

    sync.beginRound('crash', 100);
    sync.endRound({ outcome: 'LOSS', payout: 0 });
    sync.claimFaucet(5000);
    await settle();

    expect(await sync.pendingCount()).toBe(0);
    // The wager and the faucet still went; only the dead settle was discarded.
    expect(mockCalls.map((c) => c.path)).toEqual(['/games/crash/wager', '/faucet']);
  });

  it('treats an expired session as retryable, not as a dead job', async () => {
    mockFail = () => ({ status: 401 });
    sync.beginRound('crash', 100);
    await settle();
    // Held, not dropped: the session may come back.
    expect(await sync.pendingCount()).toBe(1);
  });

  it('gives a double down its own stake id on the same round', async () => {
    sync.beginRound('blackjack', 100);
    sync.addStake('blackjack', 100);
    await settle();

    const [first, second] = mockCalls;
    expect(second.body.roundId).toBe(first.body.roundId);
    expect(second.body.stakeId).not.toBe(first.body.stakeId);
  });

  it('ignores a settle with no round open', async () => {
    sync.endRound({ outcome: 'WIN', payout: 100 });
    await settle();
    expect(mockCalls).toHaveLength(0);
  });

  it('survives a restart with the queue intact', async () => {
    mockFail = () => ({ status: 500 });
    sync.beginRound('chambers', 25);
    await settle();

    // New process: in-memory state gone, disk retained.
    sync.__resetForTests();
    mockFail = null;
    await sync.flush();

    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].body.amount).toBe('25.0000');
  });
});
