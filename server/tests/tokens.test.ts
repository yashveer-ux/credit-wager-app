import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

// No DB is used here, but tokens.ts pulls in the db module, which insists on a
// URL at import. postgres-js connects lazily, so a placeholder opens no socket.
process.env.JWT_SECRET ??= 'unit-test-secret';
process.env.DATABASE_URL ||= 'postgres://unused';
const { signAccessToken, verifyAccessToken } = await import('../src/auth/tokens.ts');
const { hashPassword, verifyPassword } = await import('../src/auth/password.ts');

describe('access tokens', () => {
  it('round-trips the subject', () => {
    const token = signAccessToken('user-1');
    expect(verifyAccessToken(token).sub).toBe('user-1');
  });

  it('expires 15 minutes out', () => {
    const { iat, exp } = verifyAccessToken(signAccessToken('user-1'));
    expect(exp - iat).toBe(900);
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = signAccessToken('user-1').split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: 2 ** 40 })).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${forged}.${signature}`)).toThrow('INVALID_TOKEN');
  });

  it('rejects an alg=none token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'admin', exp: 2 ** 40 })).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${body}.`)).toThrow('INVALID_TOKEN');
  });

  it('rejects an expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signAccessToken('user-1');
    const body = Buffer.from(JSON.stringify({ sub: 'user-1', iat: now, exp: now - 1 })).toString(
      'base64url',
    );
    // Re-signing an expired payload with the real secret: signature is valid, exp is not.
    const [header] = token.split('.');
    const sig = createHmac('sha256', process.env.JWT_SECRET!)
      .update(`${header}.${body}`)
      .digest('base64url');
    expect(() => verifyAccessToken(`${header}.${body}.${sig}`)).toThrow('INVALID_TOKEN');
  });

  it('rejects junk', () => {
    for (const junk of ['', 'a.b.c', 'a.b', signAccessToken('u') + '.extra']) {
      expect(() => verifyAccessToken(junk)).toThrow('INVALID_TOKEN');
    }
  });
});

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('salts: the same password hashes differently every time', async () => {
    expect(await hashPassword('pw12345678')).not.toBe(await hashPassword('pw12345678'));
  });

  it('treats a malformed stored hash as a failed login', async () => {
    expect(await verifyPassword('not-a-hash', 'pw12345678')).toBe(false);
  });
});
