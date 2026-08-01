import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;
process.env.JWT_SECRET ??= 'integration-test-secret';

// Importing the auth module opens the DB connection, so only do it if there is one.
// The empty stand-ins are never touched: a skipped describe still runs its body.
const auth = url
  ? await import('../src/auth/index.ts')
  : ({} as typeof import('../src/auth/index.ts'));
const conn = url ? await import('../src/db/index.ts') : ({} as typeof import('../src/db/index.ts'));

// No database in CI? Skip rather than fail.
describe.skipIf(!url)('auth', () => {
  const { register, login, refresh, logout, AuthError, verifyAccessToken } = auth;
  const sql = conn.sql;
  const email = (tag: string) => `auth-${tag}-${Date.now()}-${Math.random()}@example.test`;
  const PASSWORD = 'correct horse battery staple';

  const newUser = (tag: string) =>
    register({ email: email(tag), password: PASSWORD, displayName: 'Auth Test' });

  beforeAll(async () => {
    // Guarantee at least one credit type, so "a wallet per credit type" is testable
    // even against an unseeded database.
    await sql`
      INSERT INTO credit_types (code, display_name, sim_exchange_rate_to_cash)
      VALUES (${`SIM_AUTHTEST_${Date.now()}`}, 'Auth Test Credits', '1')
    `;
  });

  afterAll(() => sql.end());

  describe('register', () => {
    it('creates the user and one zero wallet per credit type', async () => {
      const session = await newUser('create');

      const [row] = await sql`SELECT email, display_name FROM users WHERE id = ${session.user.id}`;
      expect(row.email).toBe(session.user.email);
      expect(row.display_name).toBe('Auth Test');

      const [{ count: typeCount }] = await sql`SELECT count(*)::int FROM credit_types`;
      const balances = await sql`
        SELECT balance FROM wallets WHERE user_id = ${session.user.id}
      `;
      expect(typeCount).toBeGreaterThan(0);
      expect(balances).toHaveLength(typeCount);
      expect(balances.every((w) => w.balance === '0.0000')).toBe(true);
    });

    it('returns a usable access token', async () => {
      const session = await newUser('token');
      expect(verifyAccessToken(session.accessToken).sub).toBe(session.user.id);
    });

    it('stores only a hash of the refresh token', async () => {
      const session = await newUser('hashed');
      const rows = await sql`
        SELECT token_hash FROM refresh_tokens WHERE user_id = ${session.user.id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).not.toBe(session.refreshToken);
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects a duplicate email, case and whitespace insensitively', async () => {
      const session = await newUser('dupe');

      await expect(
        register({ email: session.user.email, password: PASSWORD, displayName: 'Impostor' }),
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });

      await expect(
        register({
          email: `  ${session.user.email.toUpperCase()} `,
          password: PASSWORD,
          displayName: 'Impostor',
        }),
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });

      const [{ count }] = await sql`
        SELECT count(*)::int FROM users WHERE email = ${session.user.email}
      `;
      expect(count).toBe(1);
    });

    it('rejects junk input before touching the database', async () => {
      for (const bad of [
        { email: 'nope', password: PASSWORD, displayName: 'x' },
        { email: email('short'), password: 'short', displayName: 'x' },
        { email: email('noname'), password: PASSWORD, displayName: '  ' },
      ]) {
        await expect(register(bad)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      }
    });
  });

  describe('login', () => {
    it('succeeds with the right password', async () => {
      const session = await newUser('login');
      const relogin = await login({ email: session.user.email.toUpperCase(), password: PASSWORD });

      expect(relogin.user.id).toBe(session.user.id);
      expect(verifyAccessToken(relogin.accessToken).sub).toBe(session.user.id);
      expect(relogin.refreshToken).not.toBe(session.refreshToken);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const session = await newUser('wrongpw');

      const thrown = (p: Promise<unknown>) =>
        p.then(
          () => ({ code: 'no error', message: 'no error' }),
          (e: InstanceType<typeof AuthError>) => e,
        );

      const wrong = await thrown(login({ email: session.user.email, password: 'not the password' }));
      const unknown = await thrown(login({ email: email('ghost'), password: PASSWORD }));

      expect(wrong.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.message).toBe(wrong.message);
    });
  });

  describe('refresh', () => {
    it('rotates and kills the old token', async () => {
      const session = await newUser('rotate');
      const rotated = await refresh(session.refreshToken);

      expect(rotated.refreshToken).not.toBe(session.refreshToken);
      expect(verifyAccessToken(rotated.accessToken).sub).toBe(session.user.id);

      // The successor works...
      await expect(refresh(rotated.refreshToken)).resolves.toBeTruthy();
      // ...but reusing the original does not.
      await expect(refresh(session.refreshToken)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_REUSED',
      });
    });

    it('invalidates the whole family when a consumed token is reused', async () => {
      const session = await newUser('reuse');
      const rotated = await refresh(session.refreshToken);

      await expect(refresh(session.refreshToken)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_REUSED',
      });

      // The live descendant is collateral damage — that is the point.
      await expect(refresh(rotated.refreshToken)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });

      const rows = await sql`
        SELECT revoked_at FROM refresh_tokens WHERE user_id = ${session.user.id}
      `;
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.revoked_at !== null)).toBe(true);
    });

    it('rejects a token nobody ever issued', async () => {
      await expect(refresh('made-up-token')).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('rejects an expired token', async () => {
      const session = await newUser('expired');
      await sql`UPDATE refresh_tokens SET expires_at = now() - interval '1 day'
                WHERE user_id = ${session.user.id}`;

      await expect(refresh(session.refreshToken)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
    });
  });

  describe('logout', () => {
    it('revokes the session family', async () => {
      const session = await newUser('logout');
      const rotated = await refresh(session.refreshToken);

      await logout(rotated.refreshToken);

      await expect(refresh(rotated.refreshToken)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });
      const rows = await sql`
        SELECT revoked_at FROM refresh_tokens WHERE user_id = ${session.user.id}
      `;
      expect(rows.every((r) => r.revoked_at !== null)).toBe(true);
    });

    it('is a no-op for an unknown token', async () => {
      await expect(logout('made-up-token')).resolves.toBeUndefined();
    });
  });
});
