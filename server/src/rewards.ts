import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import { creditTypes, db, rewardClaims, rewards, wallets } from './db/index.ts';
import { postEntries } from './ledger.ts';
import { parseAmount } from './money.ts';

/** Rewards pay out in AI Tokens, same as the games. */
export const REWARD_CREDIT_CODE = 'SIM_AI_TOKEN';

export class RewardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RewardError';
    this.code = code;
  }
}

/**
 * Active rewards plus whether this user can claim each one right now. The
 * claimable check runs on the database clock, matching what claimReward will
 * actually enforce.
 */
export async function listRewards(userId: string) {
  const rows = await db.execute(sql`
    SELECT r.id, r.code, r.name, r.token_value, r.cooldown_seconds, lc.last_at,
           CASE
             WHEN lc.last_at IS NULL THEN true
             WHEN r.cooldown_seconds IS NULL THEN false
             ELSE lc.last_at + make_interval(secs => r.cooldown_seconds) <= now()
           END AS claimable
      FROM rewards r
      LEFT JOIN (SELECT reward_id, max(created_at) AS last_at
                   FROM reward_claims
                  WHERE user_id = ${userId}
                  GROUP BY reward_id) lc ON lc.reward_id = r.id
     WHERE r.active
     ORDER BY r.code
  `);

  return rows.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    tokenValue: r.token_value as string,
    cooldownSeconds: r.cooldown_seconds as number | null,
    lastClaimedAt: (r.last_at as Date | null) ?? null,
    claimable: r.claimable as boolean,
  }));
}

/**
 * Claims a reward: cooldown checked, claim recorded, tokens credited via the
 * ledger, all in one transaction. Null cooldown means one-time — a second claim
 * is rejected forever.
 */
export async function claimReward(userId: string, rewardCode: string) {
  return db.transaction(async (tx) => {
    const [reward] = await tx.select().from(rewards).where(eq(rewards.code, rewardCode));
    if (!reward) throw new RewardError('UNKNOWN_REWARD', `no reward with code ${rewardCode}`);
    if (!reward.active) throw new RewardError('INACTIVE', 'reward is not active');

    // Serialize concurrent claims per (user, reward). reward_claims has no
    // unique key to lean on, and a first claim has no row to SELECT FOR UPDATE,
    // so an advisory xact lock is the smallest correct guard — and it doesn't
    // block other users claiming the same reward.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${reward.id}`}, 0))`,
    );

    // Cooldown compared on the database clock, where created_at was stamped.
    const [last] = await tx.execute(sql`
      SELECT created_at + make_interval(secs => ${reward.cooldownSeconds ?? 0}) > now() AS in_cooldown
        FROM reward_claims
       WHERE user_id = ${userId} AND reward_id = ${reward.id}
       ORDER BY created_at DESC
       LIMIT 1
    `);
    if (last) {
      if (reward.cooldownSeconds === null) {
        throw new RewardError('ALREADY_CLAIMED', 'one-time reward already claimed');
      }
      if (last.in_cooldown) throw new RewardError('COOLDOWN', 'reward is still cooling down');
    }

    const [ct] = await tx
      .select({ id: creditTypes.id })
      .from(creditTypes)
      .where(eq(creditTypes.code, REWARD_CREDIT_CODE));
    if (!ct) throw new RewardError('UNKNOWN_CREDIT_TYPE', 'run `npm run db:seed`');
    await tx.insert(wallets).values({ userId, creditTypeId: ct.id }).onConflictDoNothing();

    // Supply the ledger row id ourselves so the claim row can point at it.
    const transactionId = randomUUID();
    const [balance] = await postEntries(tx, [
      {
        id: transactionId,
        userId,
        creditTypeId: ct.id,
        type: 'REWARD_CLAIM',
        amount: parseAmount(reward.tokenValue),
        metadata: { rewardId: reward.id, rewardCode: reward.code },
      },
    ]);

    await tx.insert(rewardClaims).values({ rewardId: reward.id, userId, transactionId });

    return { balance, tokenValue: reward.tokenValue };
  });
}
