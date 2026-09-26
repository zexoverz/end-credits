ALTER TABLE "packages" ADD COLUMN "declared_repo" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "declared_directory" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "declared_homepage" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "repo_source" text;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_repo_source" CHECK ("packages"."repo_source" in ('registry','declared'));