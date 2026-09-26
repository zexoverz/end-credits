ALTER TABLE "holds" ADD COLUMN "return_tx" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "leftover_micro" bigint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "return_tx" text;