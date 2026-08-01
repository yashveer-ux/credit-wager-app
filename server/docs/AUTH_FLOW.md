# Auth Flow

One auth system for everything. HTTP routes and WebSocket connections both trust exactly one thing: a valid **access token**.

## Tokens

| Token | Form | Lifetime | Where it lives |
|---|---|---|---|
| Access token | HS256 JWT, `sub` = user id (`JWT_SECRET`, alg pinned to HS256) | 15 minutes | Client memory only. Never stored server-side. |
| Refresh token | 256-bit random string | 30 days | Client secure storage; server stores only its SHA-256 hash in `refresh_tokens`. |

Verification lives in `src/auth/tokens.ts` (`verifyAccessToken` — throws `AuthError('INVALID_TOKEN')` on anything wrong, expired included).

## Mobile app flow

1. `POST /auth/register` or `POST /auth/login` → `{ user, accessToken, refreshToken }`.
2. Every API call sends `Authorization: Bearer <accessToken>`. The `requireAuth` preHandler in `src/app.ts` verifies it and sets `request.userId`. Routes never accept a client-supplied user id.
3. On a 401 (`INVALID_TOKEN`), call `POST /auth/refresh` with `{ refreshToken }` → a **new** access token and a **new** refresh token. Replace both; the old refresh token is dead.
4. `POST /auth/logout` with `{ refreshToken }` revokes the whole session family.

## Refresh rotation & theft detection

Every refresh token belongs to a *family* (one family per login). Refreshing consumes the presented token and issues its successor in the same family — single use, enforced by a winner-takes-all DB update, so two concurrent refreshes with the same token cannot both succeed.

Presenting an **already-consumed** token means it leaked: the entire family is revoked (`REFRESH_TOKEN_REUSED`), killing both the thief's session and the victim's — the user just logs in again. Expired, revoked, or unknown tokens get `INVALID_REFRESH_TOKEN`.

## WebSocket (realtime) flow

Same Bearer access token, verified with the same `verifyAccessToken`:

1. Client obtains a fresh access token first (refresh if near expiry — it only has to be valid *at connect time*).
2. Client connects and presents the token — `Authorization: Bearer <token>` header on the upgrade request, or as the first message if the client can't set headers. The realtime layer calls `verifyAccessToken(token)` and binds the connection to `payload.sub`. Invalid/expired → close the socket immediately.
3. The connection's user id is fixed at authentication. No message on the socket may ever name a different user id; every handler uses the bound one.
4. Token expiry mid-connection does **not** drop the socket — the 15-minute TTL gates *establishing* connections. On reconnect the client needs a currently-valid token again, so a logged-out (revoked-family) user can't refresh and therefore can't reconnect.

No separate WS ticket system, no cookies, no second secret.
