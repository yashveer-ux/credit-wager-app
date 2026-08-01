ALTER TABLE "game_rounds" ALTER COLUMN "outcome" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rounds" ALTER COLUMN "payout_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rounds" ALTER COLUMN "rng_seed" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_code_unique" UNIQUE("code");