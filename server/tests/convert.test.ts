import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

// No database in CI? Skip rather than fail.
describe.skipIf(!url)('convert', () => {
  const sql = postgres(url!);

  // src/db/index.ts throws at import time without DATABASE_URL, so pull the
  // modules in lazily — otherwise this file explodes instead of skipping.
  let convertMod: typeof import('../src/convert.ts');
  let ledgerMod: typeof import('../src/ledger.ts');
  let dbMod: typeof import('../src/db/index.ts');
  let moneyMod: typeof import('../src/money.ts');

  let userId: string;
  let cashId: string;
  let gptId: string;
  let orphanId: string; // a credit type the user has no wallet for

  const stamp = Date.now();

  const creditType = async (code: string, rate: string, spreadBps: number) => {
    const [row] = await sql`
      INSERT INTO credit_types (code, display_name, sim_exchange_rate_to_cash, spread_bps)
      VALUES (${`${code}_${stamp}`}, ${code}, ${rate}, ${spreadBps})
      RETURNING id
    `;
    return row.id as string;
  };

  const balance = async (creditTypeId: string) => {
    const [w] = await sql`
      SELECT balance FROM wallets WHERE user_id = ${userId} AND credit_type_id = ${creditTypeId}
    `;
    return w.balance as string;
  };

  const txCount = async () => {
    const [r] = await sql`SELECT count(*)::int AS n FROM transactions WHERE user_id = ${userId}`;
    return r.n as number;
  };

  beforeAll(async () => {
    [convertMod, ledgerMod, dbMod, moneyMod] = await Promise.all([
      import('../src/convert.ts'),
      import('../src/ledger.ts'),
      import('../src/db/index.ts'),
      import('../src/money.ts'),
    ]);

    const [user] = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${`convert-test-${stamp}@example.test`}, 'not-a-real-hash', 'Convert Test')
      RETURNING id
    `;
    userId = user.id;

    cashId = await creditType('SIM_CASH_T', '1', 0);
    gptId = await creditType('SIM_GPT_T', '0.012', 500);
    orphanId = await creditType('SIM_ORPHAN_T', '0.05', 0);

    await sql`
      INSERT INTO wallets (user_id, credit_type_id)
      VALUES (${userId}, ${cashId}), (${userId}, ${gptId})
    `;

    // Fund the cash wallet the only way allowed: a ledger row.
    await sql`
      INSERT INTO transactions (user_id, type, credit_type_id, amount, balance_after)
      VALUES (${userId}, 'ADJUSTMENT', ${cashId}, '1000.0000', '0')
    `;
  });

  // The append-only trigger blocks ON DELETE CASCADE, so test rows stay behind.
  afterAll(async () => {
    await dbMod?.sql.end();
    await sql.end();
  });

  it('moves money and writes exactly two ledger rows with correct balance_after', async () => {
    const before = await txCount();

    const result = await convertMod.convert({
      userId,
      fromCreditTypeId: cashId,
      toCreditTypeId: gptId,
      amount: moneyMod.parseAmount('120'),
    });

    expect(await txCount()).toBe(before + 2);

    // 120 cash / 0.012 = 10000 credits, less the 5% spread = 9500.
    expect(result.to.amount).toBe('9500.0000');
    expect(result.from.amount).toBe('-120.0000');
    expect(result.cashValue).toBe('120.0000');

    expect(await balance(cashId)).toBe('880.0000');
    expect(await balance(gptId)).toBe('9500.0000');

    // balance_after on both rows must match the wallets they landed in.
    const rows = await sql`
      SELECT credit_type_id, type, amount, balance_after, metadata
        FROM transactions
       WHERE user_id = ${userId} AND type IN ('CONVERSION_IN', 'CONVERSION_OUT')
       ORDER BY created_at, type DESC
    `;
    expect(rows).toHaveLength(2);

    const [out, into] = rows;
    expect(out.type).toBe('CONVERSION_OUT');
    expect(out.credit_type_id).toBe(cashId);
    expect(out.amount).toBe('-120.0000');
    expect(out.balance_after).toBe('880.0000');
    expect(result.from.balance).toBe('880.0000');

    expect(into.type).toBe('CONVERSION_IN');
    expect(into.credit_type_id).toBe(gptId);
    expect(into.amount).toBe('9500.0000');
    expect(into.balance_after).toBe('9500.0000');
    expect(result.to.balance).toBe('9500.0000');

    // Auditability: the rate and spread actually used are on the row.
    expect(out.metadata).toMatchObject({
      fromRate: '1.00000000',
      toRate: '0.01200000',
      fromSpreadBps: 0,
      toSpreadBps: 500,
      cashValue: '120.0000',
      toAmount: '9500.0000',
    });
    expect(into.metadata).toEqual(out.metadata);
  });

  it('leaves the user with less after a cash -> credits -> cash round trip', async () => {
    const start = moneyMod.parseAmount(await balance(cashId));

    const out = await convertMod.convert({
      userId,
      fromCreditTypeId: cashId,
      toCreditTypeId: gptId,
      amount: start,
    });

    const back = await convertMod.convert({
      userId,
      fromCreditTypeId: gptId,
      toCreditTypeId: cashId,
      amount: moneyMod.parseAmount(out.to.amount),
    });

    const end = moneyMod.parseAmount(back.to.amount);
    expect(end).toBeLessThan(start);
    expect(moneyMod.parseAmount(await balance(cashId))).toBe(end);
    // 5% each way, so the user keeps at most 90.25% of what they started with.
    expect(end * 10_000n).toBeLessThanOrEqual(start * 9_025n);
  });

  it('rejects an overdraw', async () => {
    const held = moneyMod.parseAmount(await balance(cashId));
    const before = await txCount();

    await expect(
      convertMod.convert({
        userId,
        fromCreditTypeId: cashId,
        toCreditTypeId: gptId,
        amount: held + 1n,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

    expect(await txCount()).toBe(before);
    expect(moneyMod.parseAmount(await balance(cashId))).toBe(held);
  });

  it('rejects the obvious call-site bugs', async () => {
    const bad = (patch: Record<string, unknown>) =>
      convertMod.convert({
        userId,
        fromCreditTypeId: cashId,
        toCreditTypeId: gptId,
        amount: moneyMod.parseAmount('1'),
        ...patch,
      } as Parameters<typeof convertMod.convert>[0]);

    await expect(bad({ toCreditTypeId: cashId })).rejects.toMatchObject({
      code: 'SAME_CREDIT_TYPE',
    });
    await expect(bad({ amount: 0n })).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(bad({ amount: -1n })).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(
      bad({ toCreditTypeId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_CREDIT_TYPE' });
    await expect(bad({ toCreditTypeId: orphanId })).rejects.toMatchObject({ code: 'NO_WALLET' });
  });

  it('rolls back the debit when the credit fails', async () => {
    const before = await txCount();
    const cashBefore = await balance(cashId);

    // Same two-row shape convert uses, but the second row has no wallet, so the
    // ledger trigger raises after the first row is already inserted.
    const err = await dbMod.db
      .transaction((tx) =>
        ledgerMod.postEntries(tx, [
          { userId, creditTypeId: cashId, type: 'CONVERSION_OUT', amount: -1_0000n },
          { userId, creditTypeId: orphanId, type: 'CONVERSION_IN', amount: 1_0000n },
        ]),
      )
      .then(
        () => null,
        (e) => e as Error,
      );

    // Drizzle wraps the driver error, so the trigger's message is on the cause.
    expect(String(err?.cause ?? err)).toMatch(/no wallet for user/);

    expect(await txCount()).toBe(before);
    expect(await balance(cashId)).toBe(cashBefore);
  });

  it('will not let two concurrent converts overdraw the same wallet', async () => {
    const held = moneyMod.parseAmount(await balance(cashId));
    expect(held).toBeGreaterThan(0n);

    const attempt = () =>
      convertMod.convert({
        userId,
        fromCreditTypeId: cashId,
        toCreditTypeId: gptId,
        amount: held,
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const ok = results.filter((r) => r.status === 'fulfilled');

    expect(ok).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')?.reason).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    });
    expect(await balance(cashId)).toBe('0.0000');
  });
});
