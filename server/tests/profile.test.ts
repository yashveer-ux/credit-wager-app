import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;
process.env.JWT_SECRET ??= 'integration-test-secret';

// Importing these modules opens the DB connection, so only do it if there is one.
// The empty stand-ins are never touched: a skipped describe still runs its body.
const auth = url
  ? await import('../src/auth/index.ts')
  : ({} as typeof import('../src/auth/index.ts'));
const profile = url
  ? await import('../src/profile.ts')
  : ({} as typeof import('../src/profile.ts'));
const conn = url ? await import('../src/db/index.ts') : ({} as typeof import('../src/db/index.ts'));

// No database in CI? Skip rather than fail.
describe.skipIf(!url)('profile', () => {
  const { register } = auth;
  const { getProfile, updateProfile } = profile;
  const sql = conn.sql;
  const email = (tag: string) => `profile-${tag}-${Date.now()}-${Math.random()}@example.test`;
  // Usernames are globally unique, so salt them per run. Kept under 20 chars.
  const uname = (tag: string) =>
    `${tag}_${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;

  const newUser = (tag: string) =>
    register({
      email: email(tag),
      password: 'correct horse battery staple',
      displayName: 'Profile Test',
    });

  beforeAll(async () => {
    // register() refuses to run against an unseeded database.
    await sql`
      INSERT INTO credit_types (code, display_name, sim_exchange_rate_to_cash)
      VALUES (${`SIM_PROFILETEST_${Date.now()}`}, 'Profile Test Credits', '1')
    `;
  });

  afterAll(() => sql.end());

  describe('getProfile', () => {
    it('returns exactly the safe fields — no hash, nothing else', async () => {
      const session = await newUser('safe');
      const p = await getProfile(session.user.id);

      expect(Object.keys(p).sort()).toEqual([
        'avatarEmoji',
        'createdAt',
        'displayName',
        'email',
        'id',
        'username',
      ]);
      expect(p).toMatchObject({
        id: session.user.id,
        email: session.user.email,
        displayName: 'Profile Test',
        username: null,
        avatarEmoji: null,
      });
      expect(JSON.stringify(p)).not.toMatch(/argon2|password/i);
    });

    it('throws USER_NOT_FOUND for a userId with no row', async () => {
      await expect(getProfile('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('updateProfile', () => {
    it('updates displayName, username and avatar, and persists them', async () => {
      const session = await newUser('update');
      const username = uname('upd');

      const p = await updateProfile(session.user.id, {
        displayName: 'New Name',
        username,
        avatarEmoji: '🃏',
      });
      expect(p).toMatchObject({ id: session.user.id, displayName: 'New Name', username, avatarEmoji: '🃏' });

      const [row] = await sql`
        SELECT display_name, username, avatar_emoji FROM users WHERE id = ${session.user.id}
      `;
      expect(row).toMatchObject({ display_name: 'New Name', username, avatar_emoji: '🃏' });
    });

    it('leaves fields not in the patch untouched', async () => {
      const session = await newUser('partial');
      const username = uname('par');
      await updateProfile(session.user.id, { username });

      const p = await updateProfile(session.user.id, { displayName: 'Only The Name' });
      expect(p.username).toBe(username);
      expect(p.displayName).toBe('Only The Name');
    });

    it('rejects a duplicate username with USERNAME_TAKEN, not a DB error', async () => {
      const [a, b] = await Promise.all([newUser('dupe-a'), newUser('dupe-b')]);
      const username = uname('dup');

      await updateProfile(a.user.id, { username });
      const err = await updateProfile(b.user.id, { username }).then(
        () => null,
        (e: Error & { code?: string }) => e,
      );

      expect(err?.code).toBe('USERNAME_TAKEN');
      // The mapped error must not leak driver details.
      expect(err?.message).not.toMatch(/duplicate key|constraint|23505/i);
    });

    it('rejects bad usernames and empty patches', async () => {
      const session = await newUser('badname');

      for (const bad of [
        { username: 'ab' }, // too short
        { username: 'a'.repeat(21) }, // too long
        { username: 'has space' },
        { username: 'em0ji-😀' },
        { username: 'dash-ed' },
        { displayName: '   ' },
        { avatarEmoji: '' },
        {},
      ]) {
        await expect(updateProfile(session.user.id, bad)).rejects.toMatchObject({
          code: 'INVALID_INPUT',
        });
      }
    });
  });

  describe('isolation', () => {
    it('one user can never read or write another', async () => {
      const [a, b] = await Promise.all([newUser('iso-a'), newUser('iso-b')]);

      // A's update touches exactly A's row...
      await updateProfile(a.user.id, { displayName: 'User A', avatarEmoji: '🅰️' });

      // ...B is untouched, and each read returns only its own user's data.
      const pa = await getProfile(a.user.id);
      const pb = await getProfile(b.user.id);
      expect(pa).toMatchObject({ id: a.user.id, email: a.user.email, displayName: 'User A' });
      expect(pb).toMatchObject({
        id: b.user.id,
        email: b.user.email,
        displayName: 'Profile Test',
        avatarEmoji: null,
      });

      const [row] = await sql`SELECT display_name FROM users WHERE id = ${b.user.id}`;
      expect(row.display_name).toBe('Profile Test');
    });
  });
});
