import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

// No database in CI? Skip rather than fail.
describe.skipIf(!url)('ledger integrity', () => {
  const sql = postgres(url!);
  let userId: string;
  let creditTypeId: string;

  beforeAll(async () => {
    const [user] = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${`ledger-test-${Date.now()}@example.test`}, 'not-a-real-hash', 'Ledger Test')
      RETURNING id
    `;
    userId = user.id;

    const [creditType] = await sql`
      INSERT INTO credit_types (code, display_name, sim_exchange_rate_to_cash)
      VALUES (${`SIM_TEST_${Date.now()}`}, 'Test Credits', '1')
      RETURNING id
    `;
    creditTypeId = creditType.id;

    await sql`
      INSERT INTO wallets (user_id, credit_type_id, balance)
      VALUES (${userId}, ${creditTypeId}, '0')
    `;
  });

  // The append-only trigger also blocks ON DELETE CASCADE, so test rows stay.
  afterAll(() => sql.end());

  const balance = async () => {
    const [w] = await sql`
      SELECT balance FROM wallets WHERE user_id = ${userId} AND credit_type_id = ${creditTypeId}
    `;
    return w.balance;
  };

  const ledgerInsert = (amount: string, balanceAfterLie = '0') => sql`
    INSERT INTO transactions (user_id, type, credit_type_id, amount, balance_after)
    VALUES (${userId}, 'ADJUSTMENT', ${creditTypeId}, ${amount}, ${balanceAfterLie})
    RETURNING balance_after
  `;

  it('rejects a direct UPDATE of wallets.balance', async () => {
    await expect(
      sql`UPDATE wallets SET balance = balance + 100 WHERE user_id = ${userId}`,
    ).rejects.toThrow(/may only change via a transactions ledger insert/);

    expect(await balance()).toBe('0.0000');
  });

  it('allows a non-balance UPDATE of wallets', async () => {
    await sql`UPDATE wallets SET updated_at = now() WHERE user_id = ${userId}`;
    expect(await balance()).toBe('0.0000');
  });

  it('applies a ledger insert to the wallet and stamps balance_after', async () => {
    // balance_after is deliberately wrong here: the trigger must overwrite it.
    const [tx] = await ledgerInsert('250.5000', '999999');

    expect(tx.balance_after).toBe('250.5000');
    expect(await balance()).toBe('250.5000');
  });

  it('keeps balance_after correct across two sequential inserts', async () => {
    const [first] = await ledgerInsert('100.0000');
    const [second] = await ledgerInsert('-30.2500');

    expect(first.balance_after).toBe('350.5000');
    expect(second.balance_after).toBe('320.2500');
    expect(await balance()).toBe('320.2500');
  });

  it('rejects UPDATE and DELETE on transactions', async () => {
    await expect(
      sql`UPDATE transactions SET amount = '1' WHERE user_id = ${userId}`,
    ).rejects.toThrow(/append-only: UPDATE is not permitted/);

    await expect(
      sql`DELETE FROM transactions WHERE user_id = ${userId}`,
    ).rejects.toThrow(/append-only: DELETE is not permitted/);

    expect(await balance()).toBe('320.2500');
  });

  it('rejects a ledger row for a wallet that does not exist', async () => {
    const [other] = await sql`
      INSERT INTO credit_types (code, display_name, sim_exchange_rate_to_cash)
      VALUES (${`SIM_NOWALLET_${Date.now()}`}, 'No Wallet', '1') RETURNING id
    `;
    await expect(sql`
      INSERT INTO transactions (user_id, type, credit_type_id, amount, balance_after)
      VALUES (${userId}, 'ADJUSTMENT', ${other.id}, '1', '0')
    `).rejects.toThrow(/no wallet for user/);
  });
});
