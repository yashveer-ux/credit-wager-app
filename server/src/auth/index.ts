import { eq } from 'drizzle-orm';

import { creditTypes, db, users, wallets } from '../db/index.ts';
import { hashPassword, verifyPassword } from './password.ts';
import {
  AuthError,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './tokens.ts';

export { AuthError, verifyAccessToken } from './tokens.ts';

/**
 * Plain data in, plain data out. No HTTP here — the route layer maps
 * `AuthError.code` to a status and applies rate limiting.
 */
type Session = {
  user: { id: string; email: string; displayName: string };
  accessToken: string;
  refreshToken: string;
};

/** A real argon2id hash of a random string. Verifying against it costs the same as a real check. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Bxq5oJIz9IleGnLnggnNYw$n2B3B+RsM/c046WVYhD25LD1f5CvJV057B4P8gRuN5c';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(input: { email: string; password: string }) {
  const email = String(input.email ?? '').trim().toLowerCase();
  // Upper bound on the password too: argon2 will happily chew a 10 MB one.
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new AuthError('INVALID_INPUT');
  if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 256)
    throw new AuthError('INVALID_INPUT');
  return email;
}

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<Session> {
  const email = clean(input);
  const displayName = String(input.displayName ?? '').trim();
  if (!displayName || displayName.length > 64) throw new AuthError('INVALID_INPUT');

  const passwordHash = await hashPassword(input.password);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, displayName })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email, displayName: users.displayName });

    if (!user) return null;

    // A user with no wallet row is broken: ledger inserts raise on it. Same
    // transaction as the user, always. Balances open at 0 — handing out a
    // starting balance is the conversion engine's business, not ours.
    const types = await tx.select({ id: creditTypes.id }).from(creditTypes);
    // Fail loudly on an unseeded database. A user with no wallets looks fine at
    // registration and then fails every ledger insert forever, which is a much
    // worse way to discover that `db:seed` was never run.
    if (!types.length) throw new Error('credit_types is empty — run `npm run db:seed`');
    await tx.insert(wallets).values(types.map((t) => ({ userId: user.id, creditTypeId: t.id })));

    return { user, refreshToken: await issueRefreshToken(tx, user.id) };
  });

  if (!created) throw new AuthError('EMAIL_TAKEN');
  return {
    user: created.user,
    accessToken: signAccessToken(created.user.id),
    refreshToken: created.refreshToken,
  };
}

export async function login(input: { email: string; password: string }): Promise<Session> {
  const email = clean(input);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Always run a verify, even for an unknown email: same error, same cost, so
  // neither the response nor the clock says whether the account exists.
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, input.password);
  if (!user || !ok) throw new AuthError('INVALID_CREDENTIALS');

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    accessToken: signAccessToken(user.id),
    refreshToken: await issueRefreshToken(db, user.id),
  };
}

export async function refresh(refreshToken: string) {
  const rotated = await rotateRefreshToken(refreshToken);
  return { accessToken: signAccessToken(rotated.userId), refreshToken: rotated.refreshToken };
}

export const logout = revokeRefreshToken;
