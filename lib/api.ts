import * as SecureStore from 'expo-secure-store';

// Simulator only: a physical device cannot reach the host's localhost.
const BASE_URL = 'http://localhost:3000';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

export type Tokens = { accessToken: string; refreshToken: string };
export type User = { id: string; email: string; displayName: string };
export type Session = { user: User } & Tokens;

/** Called when the session dies and cannot be recovered. Set by the auth provider. */
let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

export async function saveTokens(t: Tokens) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, t.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);

/** An error carrying the backend's error code, so screens can map it to a message. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path: string, init: RequestInit, accessToken?: string | null) {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
}

async function toResult(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'UNKNOWN');
  return body;
}

/**
 * In flight refresh, shared by every caller.
 *
 * Refresh tokens are single use and the backend revokes the whole family when
 * a consumed one is presented again — that is its theft detection. Two requests
 * 401ing at once would each refresh, and the loser would look exactly like a
 * stolen token, logging the user out. So concurrent refreshes await one promise.
 */
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;

      const res = await request('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;

      const next = (await res.json()) as Tokens;
      await saveTokens(next);
      return next.accessToken;
    } catch {
      // Network failure is not proof the session is dead, but we have no token
      // to retry with either. The caller signs out; the user signs back in.
      return null;
    } finally {
      // Cleared in a microtask so callers that awaited this promise all see the
      // same result before the next 401 can start a fresh attempt.
      queueMicrotask(() => {
        refreshing = null;
      });
    }
  })();

  return refreshing;
}

/** Authenticated fetch. Refreshes once on a 401, then gives up and signs out. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  const res = await request(path, init, accessToken);
  if (res.status !== 401) return toResult(res);

  const renewed = await refreshAccessToken();
  if (!renewed) {
    await clearTokens();
    onSignedOut();
    throw new ApiError(401, 'SESSION_EXPIRED');
  }

  return toResult(await request(path, init, renewed));
}

// ------------------------------------------------------------------ auth calls

/** Unauthenticated by definition — never goes through apiFetch's 401 handling. */
async function authCall(path: string, body: unknown): Promise<Session> {
  const res = await request(path, { method: 'POST', body: JSON.stringify(body) });
  return toResult(res);
}

export const registerRequest = (input: {
  email: string;
  password: string;
  displayName: string;
}) => authCall('/auth/register', input);

export const loginRequest = (input: { email: string; password: string }) =>
  authCall('/auth/login', input);

export async function logoutRequest() {
  const refreshToken = await getRefreshToken();
  // Best effort: a failed revoke must not trap the user in a signed in state.
  if (refreshToken) {
    await request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  await clearTokens();
}
