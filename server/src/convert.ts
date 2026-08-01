import { and, eq, inArray } from 'drizzle-orm';

import { creditTypes, db, wallets } from './db/index.ts';
import { postEntries } from './ledger.ts';
import { convertMinor, formatAmount, parseAmount, parseRate } from './money.ts';

/** Everything the caller did wrong. `code` is what the HTTP layer maps to a 4xx. */
export class ConvertError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConvertError';
    this.code = code;
  }
}

export type ConvertInput = {
  userId: string;
  fromCreditTypeId: string;
  toCreditTypeId: string;
  /** Minor units at 10^4. Must be > 0. */
  amount: bigint;
};

export type ConvertResult = {
  from: { creditTypeId: string; amount: string; balance: string };
  to: { creditTypeId: string; amount: string; balance: string };
  /** Simulated cash value the conversion pivoted through, after the sell spread. */
  cashValue: string;
};

/**
 * POST /convert, minus the HTTP. from -> cash -> to, in one DB transaction,
 * producing exactly two ledger rows.
 */
export async function convert(input: ConvertInput): Promise<ConvertResult> {
  const { userId, fromCreditTypeId, toCreditTypeId, amount } = input;

  if (fromCreditTypeId === toCreditTypeId) {
    throw new ConvertError('SAME_CREDIT_TYPE', 'from and to credit types must differ');
  }
  if (amount <= 0n) {
    throw new ConvertError('INVALID_AMOUNT', 'amount must be positive');
  }

  return db.transaction(async (tx) => {
    const types = await tx
      .select()
      .from(creditTypes)
      .where(inArray(creditTypes.id, [fromCreditTypeId, toCreditTypeId]));

    const fromType = types.find((t) => t.id === fromCreditTypeId);
    const toType = types.find((t) => t.id === toCreditTypeId);
    if (!fromType || !toType) {
      throw new ConvertError('UNKNOWN_CREDIT_TYPE', 'unknown credit type');
    }

    // Lock both wallets before reading the balance, so two concurrent converts
    // cannot both pass the sufficiency check. Ordered by id so opposite-direction
    // converts take the locks in the same order and cannot deadlock.
    const locked = await tx
      .select({ creditTypeId: wallets.creditTypeId, balance: wallets.balance })
      .from(wallets)
      .where(
        and(
          eq(wallets.userId, userId),
          inArray(wallets.creditTypeId, [fromCreditTypeId, toCreditTypeId]),
        ),
      )
      .orderBy(wallets.creditTypeId)
      .for('update');

    const source = locked.find((w) => w.creditTypeId === fromCreditTypeId);
    if (!source || !locked.some((w) => w.creditTypeId === toCreditTypeId)) {
      throw new ConvertError('NO_WALLET', 'user has no wallet for one of these credit types');
    }
    if (parseAmount(source.balance) < amount) {
      throw new ConvertError('INSUFFICIENT_BALANCE', 'insufficient balance');
    }

    const { cash, to } = convertMinor({
      amount,
      fromRate: parseRate(fromType.simExchangeRateToCash),
      fromSpreadBps: fromType.spreadBps,
      toRate: parseRate(toType.simExchangeRateToCash),
      toSpreadBps: toType.spreadBps,
    });
    if (to <= 0n) {
      throw new ConvertError('AMOUNT_TOO_SMALL', 'amount converts to nothing at this rate');
    }

    // Both rows carry the same audit blob: rate and spread used, per spec §3.
    const metadata = {
      fromCreditTypeId,
      toCreditTypeId,
      fromRate: fromType.simExchangeRateToCash,
      toRate: toType.simExchangeRateToCash,
      fromSpreadBps: fromType.spreadBps,
      toSpreadBps: toType.spreadBps,
      fromAmount: formatAmount(amount),
      toAmount: formatAmount(to),
      cashValue: formatAmount(cash),
    };

    // Non-null: postEntries only returns null for caller-supplied ids it
    // skipped as duplicates, and conversion supplies none.
    const [fromBalance, toBalance] = (await postEntries(tx, [
      {
        userId,
        creditTypeId: fromCreditTypeId,
        type: 'CONVERSION_OUT',
        amount: -amount,
        metadata,
      },
      { userId, creditTypeId: toCreditTypeId, type: 'CONVERSION_IN', amount: to, metadata },
    ])) as [string, string];

    return {
      from: { creditTypeId: fromCreditTypeId, amount: formatAmount(-amount), balance: fromBalance },
      to: { creditTypeId: toCreditTypeId, amount: formatAmount(to), balance: toBalance },
      cashValue: formatAmount(cash),
    };
  });
}
