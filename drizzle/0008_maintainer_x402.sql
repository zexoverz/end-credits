ALTER TABLE "credits" ADD COLUMN "paid_via" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "x402_endpoint" text;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_paid_via" CHECK ("credits"."paid_via" in ('maintainer_x402','endcredits_x402'));