import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';

import { db, refreshTokens, type Db, type Tx } from '../db/index.ts';

const SECRET = process.env.JWT_SECRET;
// Fail at import, not at the first login: a server with no secret must not boot.
if (!SECRET) throw new Error('JWT_SECRET is not set');

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'INVALID_REFRESH_TOKEN'
  | 'REFRESH_TOKEN_REUSED';

/**
 * Thrown by everything in the auth layer. The route layer maps `code` to a status.
 *
 * `code` is assigned in the body rather than declared as a constructor parameter
 * property: Node runs these files with strip-only type stripping, which rejects
 * parameter properties outright. Vitest transforms via esbuild and would not
 * have caught it.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- access token

/** base64url of {"alg":"HS256","typ":"JWT"} — the only header we ever emit or accept. */
const HEADER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

const hmac = (data: string) => createHmac('sha256', SECRET).update(data).digest();

export function signAccessToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ sub: userId, iat: now, exp: now + ACCESS_TTL_S }),
  ).toString('base64url');
  const data = `${HEADER}.${body}`;
  return `${data}.${hmac(data).toString('base64url')}`;
}

/** Returns the payload, or throws AuthError('INVALID_TOKEN'). Expired counts as invalid. */
export function verifyAccessToken(token: string): { sub: string; iat: number; exp: number } {
  const [header, body, signature, ...rest] = token.split('.');
  // Comparing the header literally pins alg=HS256; "alg":"none" never gets a look-in.
  if (header !== HEADER || !body || !signature || rest.length) throw new AuthError('INVALID_TOKEN');

  const expected = hmac(`${header}.${body}`);
  const got = Buffer.from(signature, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    throw new AuthError('INVALID_TOKEN');
  }

  // Signature checked, so the body is ours and parses.
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  // exp must be a number, not merely un-expired: a missing exp would otherwise
  // compare `undefined <= now` as false and sail through as a token that never
  // expires. Only we can sign one, but a token with no expiry should never verify.
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new AuthError('INVALID_TOKEN');
  }
  return payload;
}

// --------------------------------------------------------------- refresh token

type Conn = Db | Tx;

/** The raw token is 256 bits of randomness, so a plain digest is enough — no salt, no argon2. */
const digest = (rawToken: string) => createHash('sha256').update(rawToken).digest('hex');

const revokeFamily = (conn: Conn, familyId: string) =>
  conn
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));

/** Issues a token in a new family, or in `familyId` when rotating. Returns the raw token — only ever stored hashed. */
export async function issueRefreshToken(
  conn: Conn,
  userId: string,
  familyId: string = randomUUID(),
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await conn.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: digest(token),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return token;
}

/**
 * Single-use rotation. Consumes the presented token and returns its successor.
 * A token presented twice has leaked, so its whole family is revoked.
 */
export async function rotateRefreshToken(rawToken: string) {
  type Outcome = null | { reusedFamily: string } | { userId: string; refreshToken: string };

  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, digest(rawToken)));

    if (!row || row.revokedAt || row.expiresAt <= new Date()) return null;

    // Winner-takes-all: the `consumed_at IS NULL` guard means two concurrent
    // refreshes with the same token cannot both succeed.
    const [consumed] = await tx
      .update(refreshTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.consumedAt)))
      .returning({ id: refreshTokens.id });

    if (!consumed) return { reusedFamily: row.familyId };

    return { userId: row.userId, refreshToken: await issueRefreshToken(tx, row.userId, row.familyId) };
  });

  // Outside the transaction on purpose: throwing inside would roll the revoke back.
  if (outcome && 'reusedFamily' in outcome) {
    await revokeFamily(db, outcome.reusedFamily);
    throw new AuthError('REFRESH_TOKEN_REUSED');
  }
  if (!outcome) throw new AuthError('INVALID_REFRESH_TOKEN');
  return outcome;
}

/** Logout: revokes the whole family, so no descendant of this login survives. Idempotent. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, digest(rawToken)));

  if (row) await revokeFamily(db, row.familyId);
}
