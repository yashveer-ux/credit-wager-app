CREATE TYPE "public"."transaction_type" AS ENUM('CONVERSION_IN', 'CONVERSION_OUT', 'WAGER', 'PAYOUT', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "credit_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"sim_exchange_rate_to_cash" numeric(18, 8) NOT NULL,
	"spread_bps" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "credit_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "game_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_type_id" uuid NOT NULL,
	"wager_amount" numeric(18, 4) NOT NULL,
	"outcome" text NOT NULL,
	"payout_amount" numeric(18, 4) NOT NULL,
	"rng_seed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"house_edge_pct" numeric(6, 4) NOT NULL,
	"min_wager" numeric(18, 4) NOT NULL,
	"max_wager" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"credit_type_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"balance_after" numeric(18, 4) NOT NULL,
	"related_game_round_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test_account" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_type_id" uuid NOT NULL,
	"balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_credit_type_key" UNIQUE("user_id","credit_type_id")
);
--> statement-breakpoint
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_credit_type_id_credit_types_id_fk" FOREIGN KEY ("credit_type_id") REFERENCES "public"."credit_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_type_id_credit_types_id_fk" FOREIGN KEY ("credit_type_id") REFERENCES "public"."credit_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_related_game_round_id_game_rounds_id_fk" FOREIGN KEY ("related_game_round_id") REFERENCES "public"."game_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_credit_type_id_credit_types_id_fk" FOREIGN KEY ("credit_type_id") REFERENCES "public"."credit_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_user_created_idx" ON "transactions" USING btree ("user_id","created_at" DESC);