import { eq } from 'drizzle-orm';

import { AuthError } from './auth/tokens.ts';
import { db, users } from './db/index.ts';

export type ProfileErrorCode = 'USERNAME_TAKEN' | 'USER_NOT_FOUND';

/** Same shape as AuthError — the route layer maps `code` to a status. */
export class ProfileError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode) {
    super(code);
    this.name = 'ProfileError';
    this.code = code;
  }
}

/**
 * The only columns that ever leave this module. passwordHash is not here and
 * must never be: everything selects through this map, nothing selects `*`.
 */
const SAFE = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  username: users.username,
  avatarEmoji: users.avatarEmoji,
  createdAt: users.createdAt,
};

export async function getProfile(userId: string) {
  const [row] = await db.select(SAFE).from(users).where(eq(users.id, userId));
  if (!row) throw new ProfileError('USER_NOT_FOUND');
  return row;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

const isUniqueViolation = (e: unknown) => {
  // Drizzle wraps the driver error; the postgres code lands on `cause`.
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};

/**
 * Patch-style update: only the fields present are touched. `userId` comes from
 * the verified token, never the client, so this can only ever write one row.
 */
export async function updateProfile(
  userId: string,
  input: { displayName?: string; username?: string; avatarEmoji?: string },
) {
  const patch: Partial<typeof users.$inferInsert> = {};

  if (input.displayName !== undefined) {
    const displayName = String(input.displayName).trim();
    if (!displayName || displayName.length > 64) throw new AuthError('INVALID_INPUT');
    patch.displayName = displayName;
  }
  if (input.username !== undefined) {
    if (typeof input.username !== 'string' || !USERNAME_RE.test(input.username))
      throw new AuthError('INVALID_INPUT');
    patch.username = input.username;
  }
  if (input.avatarEmoji !== undefined) {
    const avatarEmoji = String(input.avatarEmoji).trim();
    // The client renders it; we only bound it. 16 chars covers multi-codepoint emoji.
    if (!avatarEmoji || avatarEmoji.length > 16) throw new AuthError('INVALID_INPUT');
    patch.avatarEmoji = avatarEmoji;
  }
  if (!Object.keys(patch).length) throw new AuthError('INVALID_INPUT');

  patch.updatedAt = new Date();

  let row;
  try {
    [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning(SAFE);
  } catch (e) {
    // The unique constraint is the real race-proof check; map it, never leak it.
    if (isUniqueViolation(e)) throw new ProfileError('USERNAME_TAKEN');
    throw e;
  }
  if (!row) throw new ProfileError('USER_NOT_FOUND');
  return row;
}
