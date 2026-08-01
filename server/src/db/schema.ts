import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Money is always numeric(18,4). Never float. */
const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

export const transactionType = pgEnum('transaction_type', [
  'CONVERSION_IN',
  'CONVERSION_OUT',
  'WAGER',
  'PAYOUT',
  'ADJUSTMENT',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  isTestAccount: boolean('is_test_account').notNull().default(true),
});

/**
 * Rotating refresh tokens. `tokenHash` is a SHA-256 of the raw token, never the
 * token itself: a dump of this table must not hand anyone a live session.
 *
 * A `familyId` groups every token descended from one login. Rotation consumes a
 * token and issues its successor in the same family; presenting an already
 * consumed token means it leaked, so the whole family is revoked.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set when the token is rotated away. A second use of a consumed token is theft. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_family_idx').on(t.familyId)],
);

export const creditTypes = pgTable('credit_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  displayName: text('display_name').notNull(),
  // Rate, not money: 8dp so sub-cent credit rates survive a round trip.
  simExchangeRateToCash: numeric('sim_exchange_rate_to_cash', { precision: 18, scale: 8 }).notNull(),
  /** House spread in basis points. Not in the spec; used by the conversion engine. */
  spreadBps: integer('spread_bps').notNull().default(0),
});

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creditTypeId: uuid('credit_type_id')
      .notNull()
      .references(() => creditTypes.id),
    // Cached rollup of the ledger. Only the transactions trigger may write it.
    balance: money('balance').notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('wallets_user_credit_type_key').on(t.userId, t.creditTypeId)],
);

export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  houseEdgePct: numeric('house_edge_pct', { precision: 6, scale: 4 }).notNull(),
  minWager: money('min_wager').notNull(),
  maxWager: money('max_wager').notNull(),
});

export const gameRounds = pgTable('game_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  creditTypeId: uuid('credit_type_id')
    .notNull()
    .references(() => creditTypes.id),
  wagerAmount: money('wager_amount').notNull(),
  outcome: text('outcome', { enum: ['WIN', 'LOSS'] }).notNull(),
  payoutAmount: money('payout_amount').notNull(),
  rngSeed: text('rng_seed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: transactionType('type').notNull(),
    creditTypeId: uuid('credit_type_id')
      .notNull()
      .references(() => creditTypes.id),
    /** Signed: negative = debit, positive = credit. */
    amount: money('amount').notNull(),
    /** Stamped by a BEFORE INSERT trigger. Never supplied by the application. */
    balanceAfter: money('balance_after').notNull(),
    relatedGameRoundId: uuid('related_game_round_id').references(() => gameRounds.id),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('transactions_user_created_idx').on(t.userId, sql`${t.createdAt} DESC`)],
);
