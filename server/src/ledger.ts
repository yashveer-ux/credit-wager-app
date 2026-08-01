import { transactions, transactionType, type Tx } from './db/index.ts';
import { formatAmount } from './money.ts';

export type LedgerEntry = {
  userId: string;
  creditTypeId: string;
  type: (typeof transactionType.enumValues)[number];
  /** Signed minor units: negative = debit, positive = credit. */
  amount: bigint;
  relatedGameRoundId?: string;
  metadata?: Record<string, unknown>;
  /**
   * Caller-supplied row id, making the insert idempotent: a retry with the same
   * id is skipped rather than posted twice. Its balance comes back as null.
   */
  id?: string;
};

/**
 * The only thing in this codebase that writes money. Takes a Tx, never db, so a
 * caller cannot post half a conversion outside a transaction.
 *
 * wallets.balance and balance_after are the database's job (see
 * 0001_ledger_integrity.sql) — we only insert rows and read back what it decided.
 *
 * Returns each row's stamped balance_after, in entry order. An entry is null
 * when a caller-supplied `id` had already been posted and the insert was skipped.
 */
export async function postEntries(tx: Tx, entries: LedgerEntry[]): Promise<(string | null)[]> {
  if (entries.length === 0) throw new Error('postEntries: no entries');
  if (entries.some((e) => e.amount === 0n)) throw new Error('postEntries: zero amount');

  const balances: (string | null)[] = [];
  // One statement per row on purpose: AFTER ROW triggers fire at end of
  // statement, so a multi-row INSERT would stamp two entries on the same wallet
  // from the same stale balance.
  for (const e of entries) {
    const insert = tx.insert(transactions).values({
      ...(e.id ? { id: e.id } : {}),
      userId: e.userId,
      type: e.type,
      creditTypeId: e.creditTypeId,
      amount: formatAmount(e.amount),
      balanceAfter: '0', // discarded and recomputed by the BEFORE INSERT trigger
      relatedGameRoundId: e.relatedGameRoundId,
      metadata: e.metadata ?? {},
    });

    const [row] = await (e.id ? insert.onConflictDoNothing({ target: transactions.id }) : insert)
      .returning({ balanceAfter: transactions.balanceAfter });

    // No row means the id was already posted, so the money already moved.
    balances.push(row?.balanceAfter ?? null);
  }
  return balances;
}
