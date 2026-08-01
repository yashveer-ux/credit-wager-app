import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { creditTypes, db, promoCodes, promoRedemptions, wallets } from './db/index.ts';
import { postEntries } from './ledger.ts';
import { formatAmount, parseAmount } from './money.ts';

export class PromoError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PromoError';
    this.code = code;
  }
}

/** The raw code never touches the database or the logs — only this digest does. */
const hashCode = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Admin/test seeding. `tokenValue` is minor units at 10^4, like all money here. */
export async function createPromo(input: {
  code: string;
  tokenValue: bigint;
  maxUses?: number;
  maxPerUser?: number;
  expiresAt?: Date;
}) {
  if (input.tokenValue <= 0n) throw new PromoError('INVALID_AMOUNT', 'token value must be positive');

  const [row] = await db
    .insert(promoCodes)
    .values({
      codeHash: hashCode(input.code),
      tokenValue: formatAmount(input.tokenValue),
      maxUses: input.maxUses,
      ...(input.maxPerUser !== undefined ? { maxPerUser: input.maxPerUser } : {}),
      expiresAt: input.expiresAt,
    })
    .returning({ id: promoCodes.id });
  return row;
}

/** The redemption insert hit unique(promo_code_id, user_id) — this user already redeemed. */
const isAlreadyRedeemed = (e: unknown): boolean => {
  // Drizzle wraps the driver error, so the postgres fields may be on the cause.
  const err = ((e as { cause?: unknown })?.cause ?? e) as {
    code?: string;
    constraint_name?: string;
  } | null;
  return err?.code === '23505' && err?.constraint_name === 'promo_redemption_once';
};

/**
 * Redeems a promo code for the tokens it carries, exactly once per user.
 *
 * One transaction: the code row is locked FOR UPDATE so concurrent redemptions
 * serialize (usedCount can neither skip nor double-count), the credit goes
 * through the ledger, and the unique(promoCodeId, userId) constraint is the
 * per-user cap — a repeat violates it and rolls the whole thing back, credit
 * included. A code can therefore never credit the same user twice.
 */
export async function redeemPromo(userId: string, rawCode: string) {
  const codeHash = hashCode(rawCode);

  try {
    return await db.transaction(async (tx) => {
      const [promo] = await tx
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.codeHash, codeHash))
        .for('update');

      if (!promo) throw new PromoError('UNKNOWN_CODE', 'unknown promo code');
      if (!promo.active) throw new PromoError('INACTIVE', 'promo code is not active');
      if (promo.expiresAt && promo.expiresAt.getTime() <= Date.now()) {
        throw new PromoError('EXPIRED', 'promo code has expired');
      }
      if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
        throw new PromoError('EXHAUSTED', 'promo code is fully redeemed');
      }

      const [ct] = await tx
        .select({ id: creditTypes.id })
        .from(creditTypes)
        .where(eq(creditTypes.code, promo.provider));
      if (!ct) throw new PromoError('UNKNOWN_CREDIT_TYPE', `no credit type ${promo.provider}`);

      // Same reasoning as games.ts: open the wallet on demand.
      await tx.insert(wallets).values({ userId, creditTypeId: ct.id }).onConflictDoNothing();

      // The row is locked, so the usedCount we read is current.
      await tx
        .update(promoCodes)
        .set({ usedCount: promo.usedCount + 1 })
        .where(eq(promoCodes.id, promo.id));

      // Supply the ledger row id ourselves so the redemption row can point at it.
      const transactionId = randomUUID();
      const [balance] = await postEntries(tx, [
        {
          id: transactionId,
          userId,
          creditTypeId: ct.id,
          type: 'PROMO_REDEEM',
          amount: parseAmount(promo.tokenValue),
          metadata: { promoCodeId: promo.id, provider: promo.provider },
        },
      ]);

      // Last so a unique violation rolls back the credit and the count above.
      await tx.insert(promoRedemptions).values({ promoCodeId: promo.id, userId, transactionId });

      return { balance, tokenValue: promo.tokenValue, provider: promo.provider };
    });
  } catch (e) {
    if (isAlreadyRedeemed(e)) {
      // Tagged error, not the raw DB violation: callers see policy, not schema.
      throw new PromoError('ALREADY_REDEEMED', 'promo code already redeemed by this user');
    }
    throw e;
  }
}
