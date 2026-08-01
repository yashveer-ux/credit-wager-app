import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

// No database in CI? Skip rather than fail.
describe.skipIf(!url)('rewards', () => {
  const sql = postgres(url!);

  // src/db/index.ts throws at import time without DATABASE_URL, so pull the
  // modules in lazily — otherwise this file explodes instead of skipping.
  let rewardsMod: typeof import('../src/rewards.ts');
  let dbMod: typeof import('../src/db/index.ts');

  let userId: string;
  let tokenTypeId: string;
  const stamp = Date.now();

  const daily = `DAILY-${stamp}`;
  const oneTime = `ONETIME-${stamp}`;

  const makeReward = async (code: string, tokenValue: string, cooldownSeconds: number | null, active = true) => {
    const [r] = await sql`
      INSERT INTO rewards (code, name, token_value, active, cooldown_seconds)
      VALUES (${code}, ${code}, ${tokenValue}, ${active}, ${cooldownSeconds})
      RETURNING id
    `;
    return r.id as string;
  };

  const newUser = async (tag: string) => {
    const [u] = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${`rewards-${tag}-${stamp}@example.test`}, 'not-a-real-hash', 'Rewards Test')
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

  const claimTxns = (uid: string) =>
    sql`SELECT * FROM transactions WHERE user_id = ${uid} AND type = 'REWARD_CLAIM'`;

  beforeAll(async () => {
    [rewardsMod, dbMod] = await Promise.all([
      import('../src/rewards.ts'),
      import('../src/db/index.ts'),
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
    await makeReward(daily, '50', 3600);
    await makeReward(oneTime, '500', null);
  });

  // The append-only trigger blocks ON DELETE CASCADE, so test rows stay behind.
  afterAll(async () => {
    await dbMod?.sql.end();
    await sql.end();
  });

  it('claims a reward and credits its token value', async () => {
    const result = await rewardsMod.claimReward(userId, daily);
    expect(result.balance).toBe('50.0000');
    expect(result.tokenValue).toBe('50.0000');
    expect(await balance(userId)).toBe('50.0000');

    const txns = await claimTxns(userId);
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe('50.0000');
    expect(txns[0].credit_type_id).toBe(tokenTypeId);

    // The claim row points at the ledger row that paid it.
    const [claim] = await sql`
      SELECT c.transaction_id FROM reward_claims c
        JOIN rewards r ON r.id = c.reward_id
       WHERE c.user_id = ${userId} AND r.code = ${daily}
    `;
    expect(claim.transaction_id).toBe(txns[0].id);
  });

  it('rejects a second claim inside the cooldown window', async () => {
    await expect(rewardsMod.claimReward(userId, daily)).rejects.toMatchObject({
      code: 'COOLDOWN',
    });
    expect(await balance(userId)).toBe('50.0000');
    expect(await claimTxns(userId)).toHaveLength(1);
  });

  it('allows a claim again once the cooldown has elapsed', async () => {
    // Backdate the claim instead of sleeping through a real cooldown.
    await sql`
      UPDATE reward_claims SET created_at = created_at - interval '2 hours'
       WHERE user_id = ${userId}
         AND reward_id = (SELECT id FROM rewards WHERE code = ${daily})
    `;

    const result = await rewardsMod.claimReward(userId, daily);
    expect(result.balance).toBe('100.0000');
    expect(await claimTxns(userId)).toHaveLength(2);
  });

  it('rejects a one-time reward claimed twice, even after time passes', async () => {
    await rewardsMod.claimReward(userId, oneTime);
    expect(await balance(userId)).toBe('600.0000');

    await expect(rewardsMod.claimReward(userId, oneTime)).rejects.toMatchObject({
      code: 'ALREADY_CLAIMED',
    });

    // Null cooldown means never again — backdating changes nothing.
    await sql`
      UPDATE reward_claims SET created_at = created_at - interval '1 year'
       WHERE user_id = ${userId}
         AND reward_id = (SELECT id FROM rewards WHERE code = ${oneTime})
    `;
    await expect(rewardsMod.claimReward(userId, oneTime)).rejects.toMatchObject({
      code: 'ALREADY_CLAIMED',
    });
    expect(await balance(userId)).toBe('600.0000');
  });

  it('rejects an unknown reward and an inactive one', async () => {
    await expect(rewardsMod.claimReward(userId, `NOPE-${stamp}`)).rejects.toMatchObject({
      code: 'UNKNOWN_REWARD',
    });

    await makeReward(`OFF-${stamp}`, '10', null, false);
    await expect(rewardsMod.claimReward(userId, `OFF-${stamp}`)).rejects.toMatchObject({
      code: 'INACTIVE',
    });
  });

  it('credits only once under a concurrent double-claim', async () => {
    const code = `RACE-${stamp}`;
    await makeReward(code, '75', null);
    const racer = await newUser('race');

    const results = await Promise.allSettled([
      rewardsMod.claimReward(racer, code),
      rewardsMod.claimReward(racer, code),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')?.reason).toMatchObject({
      code: 'ALREADY_CLAIMED',
    });

    expect(await balance(racer)).toBe('75.0000');
    expect(await claimTxns(racer)).toHaveLength(1);
  });

  it('lists active rewards with a per-user claimable flag', async () => {
    const fresh = `LIST-FRESH-${stamp}`;
    await makeReward(fresh, '1', 60);
    await makeReward(`LIST-OFF-${stamp}`, '1', 60, false);

    const list = await rewardsMod.listRewards(userId);
    const byCode = new Map(list.map((r) => [r.code, r]));

    // Never claimed by this user: claimable.
    expect(byCode.get(fresh)?.claimable).toBe(true);
    // Just claimed in the test above, 1h cooldown: not claimable.
    expect(byCode.get(daily)?.claimable).toBe(false);
    // One-time and already claimed: never claimable again.
    expect(byCode.get(oneTime)?.claimable).toBe(false);
    // Inactive rewards are not listed at all.
    expect(byCode.has(`LIST-OFF-${stamp}`)).toBe(false);

    expect(byCode.get(daily)?.tokenValue).toBe('50.0000');
    expect(byCode.get(daily)?.lastClaimedAt).not.toBeNull();
  });
});
