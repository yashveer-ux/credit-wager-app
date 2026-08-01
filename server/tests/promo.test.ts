import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

// No database in CI? Skip rather than fail.
describe.skipIf(!url)('promo', () => {
  const sql = postgres(url!);

  // src/db/index.ts throws at import time without DATABASE_URL, so pull the
  // modules in lazily — otherwise this file explodes instead of skipping.
  let promoMod: typeof import('../src/promo.ts');
  let dbMod: typeof import('../src/db/index.ts');
  let moneyMod: typeof import('../src/money.ts');

  let userId: string;
  let tokenTypeId: string;
  const stamp = Date.now();

  const newUser = async (tag: string) => {
    const [u] = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${`promo-${tag}-${stamp}@example.test`}, 'not-a-real-hash', 'Promo Test')
      RETURNING id
    `;
    return u.id as string;
  };

  const balance = async (uid: string) => {
    const [w] = await sql`
      SELECT balance FROM wallets WHERE user_id = ${uid} AND credit_type_id = ${tokenTypeId}
    `;
    return (w?.balance as string) ?? '0.0000';
  };

  const redeemTxns = (uid: string) =>
    sql`SELECT * FROM transactions WHERE user_id = ${uid} AND type = 'PROMO_REDEEM'`;

  const usedCount = async (promoId: string) => {
    const [r] = await sql`SELECT used_count FROM promo_codes WHERE id = ${promoId}`;
    return r.used_count as number;
  };

  beforeAll(async () => {
    [promoMod, dbMod, moneyMod] = await Promise.all([
      import('../src/promo.ts'),
      import('../src/db/index.ts'),
      import('../src/money.ts'),
    ]);

    // The seed normally creates SIM_AI_TOKEN; upsert so the test stands alone.
    const [ct] = await sql`
      INSERT INTO credit_types (code, display_name, sim_exchange_rate_to_cash)
      VALUES ('SIM_AI_TOKEN', 'AI Token', '0.01')
      ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `;
    tokenTypeId = ct.id;

    userId = await newUser('main');
  });

  // The append-only trigger blocks ON DELETE CASCADE, so test rows stay behind.
  afterAll(async () => {
    await dbMod?.sql.end();
    await sql.end();
  });

  it('redeems a code and credits exactly the token value', async () => {
    const code = `WELCOME-${stamp}`;
    const { id: promoId } = await promoMod.createPromo({
      code,
      tokenValue: moneyMod.parseAmount('250'),
    });

    // Only a sha256 digest hits the table, never the raw code.
    const [stored] = await sql`SELECT code_hash FROM promo_codes WHERE id = ${promoId}`;
    expect(stored.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.code_hash).not.toBe(code);

    const result = await promoMod.redeemPromo(userId, code);
    expect(result.balance).toBe('250.0000');
    expect(result.tokenValue).toBe('250.0000');
    expect(result.provider).toBe('SIM_AI_TOKEN');

    expect(await balance(userId)).toBe('250.0000');

    const txns = await redeemTxns(userId);
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe('250.0000');
    expect(txns[0].credit_type_id).toBe(tokenTypeId);

    // The redemption row points at the ledger row that paid it.
    const [red] = await sql`
      SELECT transaction_id FROM promo_redemptions
       WHERE user_id = ${userId} AND promo_code_id = ${promoId}
    `;
    expect(red.transaction_id).toBe(txns[0].id);
    expect(await usedCount(promoId)).toBe(1);
  });

  it('rejects a repeat by the same user and does not credit twice', async () => {
    await expect(promoMod.redeemPromo(userId, `WELCOME-${stamp}`)).rejects.toMatchObject({
      code: 'ALREADY_REDEEMED',
    });

    expect(await balance(userId)).toBe('250.0000');
    expect(await redeemTxns(userId)).toHaveLength(1);

    // The usedCount bump rolled back with the rest.
    const [promo] = await sql`
      SELECT used_count FROM promo_codes c
        JOIN promo_redemptions r ON r.promo_code_id = c.id
       WHERE r.user_id = ${userId}
    `;
    expect(promo.used_count).toBe(1);
  });

  it('rejects an unknown code', async () => {
    await expect(promoMod.redeemPromo(userId, `NO-SUCH-CODE-${stamp}`)).rejects.toMatchObject({
      code: 'UNKNOWN_CODE',
    });
  });

  it('rejects an expired code without crediting', async () => {
    const code = `EXPIRED-${stamp}`;
    await promoMod.createPromo({
      code,
      tokenValue: moneyMod.parseAmount('10'),
      expiresAt: new Date(Date.now() - 1000),
    });

    const before = await balance(userId);
    await expect(promoMod.redeemPromo(userId, code)).rejects.toMatchObject({ code: 'EXPIRED' });
    expect(await balance(userId)).toBe(before);
  });

  it('rejects an inactive code', async () => {
    const code = `INACTIVE-${stamp}`;
    const { id } = await promoMod.createPromo({ code, tokenValue: moneyMod.parseAmount('10') });
    await sql`UPDATE promo_codes SET active = false WHERE id = ${id}`;

    await expect(promoMod.redeemPromo(userId, code)).rejects.toMatchObject({ code: 'INACTIVE' });
  });

  it('rejects once maxUses is exhausted', async () => {
    const code = `LIMITED-${stamp}`;
    const { id } = await promoMod.createPromo({
      code,
      tokenValue: moneyMod.parseAmount('5'),
      maxUses: 1,
    });

    const first = await newUser('limited-a');
    const second = await newUser('limited-b');

    await promoMod.redeemPromo(first, code);
    await expect(promoMod.redeemPromo(second, code)).rejects.toMatchObject({ code: 'EXHAUSTED' });

    expect(await usedCount(id)).toBe(1);
    expect(await balance(second)).toBe('0.0000');
  });

  it('credits once when the same user redeems concurrently', async () => {
    const code = `RACE-${stamp}`;
    const { id } = await promoMod.createPromo({ code, tokenValue: moneyMod.parseAmount('100') });
    const racer = await newUser('race');

    const results = await Promise.allSettled([
      promoMod.redeemPromo(racer, code),
      promoMod.redeemPromo(racer, code),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')?.reason).toMatchObject({
      code: 'ALREADY_REDEEMED',
    });

    expect(await balance(racer)).toBe('100.0000');
    expect(await redeemTxns(racer)).toHaveLength(1);
    expect(await usedCount(id)).toBe(1);
  });
});
