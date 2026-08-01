CREATE TYPE "public"."bj_hand_outcome" AS ENUM('WIN', 'LOSS', 'PUSH', 'BLACKJACK', 'BUST');--> statement-breakpoint
CREATE TYPE "public"."bj_round_phase" AS ENUM('BETTING', 'DEALING', 'PLAYER_TURNS', 'DEALER_TURN', 'SETTLED');--> statement-breakpoint
CREATE TYPE "public"."bj_table_status" AS ENUM('OPEN', 'IN_ROUND', 'CLOSED');--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'PROMO_REDEEM';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'REWARD_CLAIM';--> statement-breakpoint
CREATE TABLE "blackjack_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bj_event_seq" UNIQUE("table_id","seq")
);
--> statement-breakpoint
CREATE TABLE "blackjack_hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"wager" numeric(18, 4) NOT NULL,
	"doubled" boolean DEFAULT false NOT NULL,
	"cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" "bj_hand_outcome",
	"payout" numeric(18, 4),
	"wager_txn_id" uuid,
	"payout_txn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bj_hand_once" UNIQUE("round_id","seat")
);
--> statement-breakpoint
CREATE TABLE "blackjack_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"phase" "bj_round_phase" DEFAULT 'BETTING' NOT NULL,
	"deck" jsonb NOT NULL,
	"dealer_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_seat" integer,
	"deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "blackjack_table_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"left_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bj_seat_unique" UNIQUE("table_id","seat"),
	CONSTRAINT "bj_player_unique" UNIQUE("table_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "blackjack_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"status" "bj_table_status" DEFAULT 'OPEN' NOT NULL,
	"max_seats" integer DEFAULT 5 NOT NULL,
	"min_wager" numeric(18, 4) DEFAULT '10' NOT NULL,
	"max_wager" numeric(18, 4) DEFAULT '5000' NOT NULL,
	"credit_type_id" uuid NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blackjack_tables_room_code_unique" UNIQUE("room_code")
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"provider" text DEFAULT 'SIM_AI_TOKEN' NOT NULL,
	"token_value" numeric(18, 4) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"max_per_user" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_redemption_once" UNIQUE("promo_code_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reward_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"token_value" numeric(18, 4) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cooldown_seconds" integer,
	CONSTRAINT "rewards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_emoji" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "blackjack_events" ADD CONSTRAINT "blackjack_events_table_id_blackjack_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."blackjack_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_round_id_blackjack_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."blackjack_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_wager_txn_id_transactions_id_fk" FOREIGN KEY ("wager_txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_hands" ADD CONSTRAINT "blackjack_hands_payout_txn_id_transactions_id_fk" FOREIGN KEY ("payout_txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_rounds" ADD CONSTRAINT "blackjack_rounds_table_id_blackjack_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."blackjack_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_table_players" ADD CONSTRAINT "blackjack_table_players_table_id_blackjack_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."blackjack_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_table_players" ADD CONSTRAINT "blackjack_table_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackjack_tables" ADD CONSTRAINT "blackjack_tables_credit_type_id_credit_types_id_fk" FOREIGN KEY ("credit_type_id") REFERENCES "public"."credit_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_claims_user_reward_idx" ON "reward_claims" USING btree ("user_id","reward_id","created_at" DESC);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");