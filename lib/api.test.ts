import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// jest.mock is hoisted above declarations, so the factory may only close over
// variables whose names start with "mock".
const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

const { ApiError, apiFetch, setSignedOutHandler } = require('./api') as typeof import('./api');

const json = (status: number, body: unknown) =>
  ({ status, ok: status < 400, json: async () => body }) as Response;

/** Queues one response per call, so a test can script a 401 then a success. */
function mockFetch(responses: Response[]) {
  const calls: string[] = [];
  const fn = jest.fn(async (url: string) => {
    calls.push(url);
    return responses.shift() ?? json(500, { error: 'NO_MORE_RESPONSES' });
  });
  (globalThis as { fetch: unknown }).fetch = fn;
  return calls;
}

beforeEach(() => {
  mockStore.clear();
  mockStore.set('accessToken', 'stale-access');
  mockStore.set('refreshToken', 'refresh-1');
  setSignedOutHandler(() => {});
});

describe('apiFetch', () => {
  it('returns the body when the request succeeds', async () => {
    mockFetch([json(200, { wallets: [] })]);
    await expect(apiFetch('/wallets')).resolves.toEqual({ wallets: [] });
  });

  it('throws an ApiError carrying the backend code', async () => {
    mockFetch([json(409, { error: 'INSUFFICIENT_BALANCE' })]);
    await expect(apiFetch('/convert')).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      status: 409,
    });
  });

  it('refreshes once on a 401 and retries the original request', async () => {
    const calls = mockFetch([
      json(401, { error: 'INVALID_TOKEN' }),
      json(200, { accessToken: 'fresh-access', refreshToken: 'refresh-2' }),
      json(200, { wallets: ['ok'] }),
    ]);

    await expect(apiFetch('/wallets')).resolves.toEqual({ wallets: ['ok'] });
    expect(calls).toEqual([
      'http://localhost:3000/wallets',
      'http://localhost:3000/auth/refresh',
      'http://localhost:3000/wallets',
    ]);
    // The rotated pair must be persisted, or the next refresh replays a
    // consumed token and the backend revokes the family as theft.
    expect(mockStore.get('accessToken')).toBe('fresh-access');
    expect(mockStore.get('refreshToken')).toBe('refresh-2');
  });

  /**
   * The reason single-flight exists. Refresh tokens are single use and the
   * backend treats a replayed one as theft, revoking the whole family. Two
   * simultaneous 401s must therefore produce exactly one refresh.
   */
  it('shares one refresh between concurrent 401s', async () => {
    const calls = mockFetch([
      json(401, { error: 'INVALID_TOKEN' }),
      json(401, { error: 'INVALID_TOKEN' }),
      json(200, { accessToken: 'fresh-access', refreshToken: 'refresh-2' }),
      json(200, { a: 1 }),
      json(200, { b: 2 }),
    ]);

    const [a, b] = await Promise.all([apiFetch('/wallets'), apiFetch('/transactions')]);

    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
    expect(calls.filter((u) => u.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('signs out when the refresh is rejected', async () => {
    mockFetch([
      json(401, { error: 'INVALID_TOKEN' }),
      json(401, { error: 'REFRESH_TOKEN_REUSED' }),
    ]);

    let signedOut = false;
    setSignedOutHandler(() => {
      signedOut = true;
    });

    await expect(apiFetch('/wallets')).rejects.toBeInstanceOf(ApiError);
    expect(signedOut).toBe(true);
    expect(mockStore.has('accessToken')).toBe(false);
    expect(mockStore.has('refreshToken')).toBe(false);
  });

  it('signs out when there is no refresh token to use', async () => {
    mockStore.delete('refreshToken');
    mockFetch([json(401, { error: 'INVALID_TOKEN' })]);

    let signedOut = false;
    setSignedOutHandler(() => {
      signedOut = true;
    });

    await expect(apiFetch('/wallets')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(signedOut).toBe(true);
  });

  it('starts a new refresh after the previous one settles', async () => {
    mockFetch([
      json(401, { error: 'INVALID_TOKEN' }),
      json(200, { accessToken: 'fresh-1', refreshToken: 'refresh-2' }),
      json(200, {}),
    ]);
    await apiFetch('/wallets');

    // A later 401 must not reuse the settled promise from the first refresh.
    const calls = mockFetch([
      json(401, { error: 'INVALID_TOKEN' }),
      json(200, { accessToken: 'fresh-2', refreshToken: 'refresh-3' }),
      json(200, {}),
    ]);
    await apiFetch('/wallets');

    expect(calls.filter((u) => u.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(mockStore.get('accessToken')).toBe('fresh-2');
  });
});
