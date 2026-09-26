ALTER TABLE "approvals" ADD COLUMN "approval_ref" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "release_deadline" bigint;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "release_signature" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "approver_address" text;