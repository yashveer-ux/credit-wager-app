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
  // Double-down reuses WAGER, push/refund reuses PAYOUT — the outcome column on
  // game_rounds/blackjack_hands carries the distinction. These two are genuinely
  // new money sources with no existing type.
  'PROMO_REDEEM',
  'REWARD_CLAIM',
]);

/** Lifecycle of a multiplayer table. */
export const tableStatus = pgEnum('bj_table_status', ['OPEN', 'IN_ROUND', 'CLOSED']);

/** Where a round is in the deal → turns → dealer → settle cycle. */
export const roundPhase = pgEnum('bj_round_phase', [
  'BETTING',
  'DEALING',
  'PLAYER_TURNS',
  'DEALER_TURN',
  'SETTLED',
]);

export const handOutcome = pgEnum('bj_hand_outcome', ['WIN', 'LOSS', 'PUSH', 'BLACKJACK', 'BUST']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  isTestAccount: boolean('is_test_account').notNull().default(true),
  // Profile fields. displayName above is the name; these are the rest.
  username: text('username').unique(),
  avatarEmoji: text('avatar_emoji'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  /** Stable client-facing identifier, e.g. `blackjack`. Used in route params. */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  houseEdgePct: numeric('house_edge_pct', { precision: 6, scale: 4 }).notNull(),
  minWager: money('min_wager').notNull(),
  maxWager: money('max_wager').notNull(),
});

/**
 * A round is opened when the wager is placed and closed when it settles, so
 * `outcome` and `payoutAmount` are null in between. A round that never settles
 * — the app was killed mid-play — stays open, and its WAGER row stands.
 */
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
  // PUSH is a blackjack tie: the stake comes back, nobody wins.
  outcome: text('outcome', { enum: ['WIN', 'LOSS', 'PUSH'] }),
  payoutAmount: money('payout_amount'),
  /**
   * Nullable because this prototype settles from client-reported results, so
   * there is no server-side seed to record. See src/games.ts.
   */
  rngSeed: text('rng_seed'),
  settledAt: timestamp('settled_at', { withTimezone: true }),
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

// ---------------------------------------------------------------- promo & rewards

/**
 * Redeemable codes. The raw code is never stored — only a hash — so a table dump
 * cannot be used to redeem. `maxUses`/`maxPerUser` null means unlimited.
 */
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  codeHash: text('code_hash').notNull().unique(),
  provider: text('provider').notNull().default('SIM_AI_TOKEN'),
  tokenValue: money('token_value').notNull(),
  active: boolean('active').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  maxUses: integer('max_uses'),
  maxPerUser: integer('max_per_user').notNull().default(1),
  usedCount: integer('used_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const promoRedemptions = pgTable(
  'promo_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    promoCodeId: uuid('promo_code_id')
      .notNull()
      .references(() => promoCodes.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').references(() => transactions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // One row per (code, user, attempt): the unique key below enforces per-user caps
  // at maxPerUser=1 and stops a double redemption racing itself.
  (t) => [unique('promo_redemption_once').on(t.promoCodeId, t.userId)],
);

/** A claimable reward definition, e.g. a daily bonus. */
export const rewards = pgTable('rewards', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  tokenValue: money('token_value').notNull(),
  active: boolean('active').notNull().default(true),
  /** Null = one-time. Otherwise the minimum gap between claims, in seconds. */
  cooldownSeconds: integer('cooldown_seconds'),
});

export const rewardClaims = pgTable(
  'reward_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rewardId: uuid('reward_id')
      .notNull()
      .references(() => rewards.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').references(() => transactions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reward_claims_user_reward_idx').on(t.userId, t.rewardId, sql`${t.createdAt} DESC`)],
);

// ----------------------------------------------------- multiplayer blackjack

export const blackjackTables = pgTable('blackjack_tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Short human code for private-table joins. Null for public tables. */
  roomCode: text('room_code').unique(),
  isPrivate: boolean('is_private').notNull().default(false),
  status: tableStatus('status').notNull().default('OPEN'),
  maxSeats: integer('max_seats').notNull().default(5),
  minWager: money('min_wager').notNull().default('10'),
  maxWager: money('max_wager').notNull().default('5000'),
  creditTypeId: uuid('credit_type_id')
    .notNull()
    .references(() => creditTypes.id),
  /** Bumped on every state change; clients recover missed events by comparing it. */
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const blackjackTablePlayers = pgTable(
  'blackjack_table_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: uuid('table_id')
      .notNull()
      .references(() => blackjackTables.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seat: integer('seat').notNull(),
    ready: boolean('ready').notNull().default(false),
    /** Cleared when a player disconnects; the reconnect grace timer reads it. */
    connected: boolean('connected').notNull().default(true),
    leftAt: timestamp('left_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One occupant per seat, and a user sits at a table once.
    unique('bj_seat_unique').on(t.tableId, t.seat),
    unique('bj_player_unique').on(t.tableId, t.userId),
  ],
);

export const blackjackRounds = pgTable('blackjack_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id')
    .notNull()
    .references(() => blackjackTables.id, { onDelete: 'cascade' }),
  phase: roundPhase('phase').notNull().default('BETTING'),
  /**
   * The shuffled shoe and dealer hole card live here, server-only. This row is
   * NEVER serialised to a client — the realtime layer projects a safe view.
   */
  deck: jsonb('deck').notNull(),
  dealerCards: jsonb('dealer_cards').notNull().default([]),
  /** Seat whose turn it is, null outside PLAYER_TURNS. */
  activeSeat: integer('active_seat'),
  /** Server-owned deadline for the current phase; clients render, never enforce. */
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
});

export const blackjackHands = pgTable(
  'blackjack_hands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => blackjackRounds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seat: integer('seat').notNull(),
    wager: money('wager').notNull(),
    doubled: boolean('doubled').notNull().default(false),
    cards: jsonb('cards').notNull().default([]),
    outcome: handOutcome('outcome'),
    payout: money('payout'),
    /** Ledger WAGER row for this hand; makes the debit idempotent per hand. */
    wagerTxnId: uuid('wager_txn_id').references(() => transactions.id),
    payoutTxnId: uuid('payout_txn_id').references(() => transactions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('bj_hand_once').on(t.roundId, t.seat)],
);

/**
 * Append-only event log per table. `seq` is monotonic within a table so a
 * reconnecting client can ask for everything after the last seq it saw.
 */
export const blackjackEvents = pgTable(
  'blackjack_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: uuid('table_id')
      .notNull()
      .references(() => blackjackTables.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('bj_event_seq').on(t.tableId, t.seq)],
);
