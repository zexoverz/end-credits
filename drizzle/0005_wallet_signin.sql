CREATE TABLE "siwe_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_wallet_address_unique" UNIQUE("wallet_address");