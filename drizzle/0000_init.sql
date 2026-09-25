CREATE TABLE "agent_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"bound_via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agent_keys_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "agent_keys_bound_via" CHECK ("agent_keys"."bound_via" in ('dev','device_grant'))
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hold_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"method" text NOT NULL,
	"payload" jsonb,
	"nonce" text,
	"state" text,
	"code_verifier_enc" text,
	"started_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"auth_time" timestamp with time zone,
	"acr" text,
	"amr" text[],
	"completed_at" timestamp with time zone,
	CONSTRAINT "approvals_nonce_unique" UNIQUE("nonce"),
	CONSTRAINT "approvals_state_unique" UNIQUE("state"),
	CONSTRAINT "approvals_method" CHECK ("approvals"."method" in ('session','world')),
	CONSTRAINT "approvals_status" CHECK ("approvals"."status" in ('pending','approved','failed'))
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_full_name" text NOT NULL,
	"maintainer_id" uuid NOT NULL,
	"wallet_address" text,
	"wallet_kind" text DEFAULT 'coinbase_smart_wallet',
	"pr_number" integer,
	"pr_url" text,
	"pr_mode" text,
	"merged_sha" text,
	"verified_funding_sha" text,
	"screen_id" uuid,
	"set_claim_tx" text,
	"claim_txs" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_pr_mode" CHECK ("claims"."pr_mode" in ('api','new_file_link')),
	CONSTRAINT "claims_status" CHECK ("claims"."status" in ('started','wallet','pr_open','merged','verified','claimed','refused'))
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"amount_micro" bigint NOT NULL,
	"capped" boolean DEFAULT false NOT NULL,
	"role" text NOT NULL,
	"payee" text,
	"payee_source" text,
	"outcome" text,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"screen_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"tip_id" text,
	"tx_hash" text,
	"receipt" jsonb,
	"decided_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "credits_session_id_package_id_unique" UNIQUE("session_id","package_id"),
	CONSTRAINT "credits_role" CHECK ("credits"."role" in ('starring','featuring','research','thanks')),
	CONSTRAINT "credits_outcome" CHECK ("credits"."outcome" in ('paid','capped','held','refused','reserved','dust'))
);
--> statement-breakpoint
CREATE TABLE "device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"device_code_enc" text,
	"user_code" text,
	"verification_uri" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_id" uuid NOT NULL,
	"tip_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"hold_tx" text NOT NULL,
	"release_tx" text,
	"refund_tx" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "holds_credit_id_unique" UNIQUE("credit_id"),
	CONSTRAINT "holds_tip_id_unique" UNIQUE("tip_id"),
	CONSTRAINT "holds_status" CHECK ("holds"."status" in ('pending','released','denied','expired'))
);
--> statement-breakpoint
CREATE TABLE "maintainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"github_login" text NOT NULL,
	"token_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintainers_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"hold_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iss" text,
	"sub" text,
	"sub_hash" text,
	"display_name" text NOT NULL,
	"payer_address" text NOT NULL,
	"session_budget_micro" bigint DEFAULT 2000000 NOT NULL,
	"package_cap_micro" bigint DEFAULT 250000 NOT NULL,
	"daily_limit_micro" bigint DEFAULT 20000000 NOT NULL,
	"hold_ttl_seconds" integer DEFAULT 86400 NOT NULL,
	"settle_mode" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_iss_sub_unique" UNIQUE("iss","sub"),
	CONSTRAINT "owners_settle_mode" CHECK ("owners"."settle_mode" in ('auto','on_open'))
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecosystem" text DEFAULT 'npm' NOT NULL,
	"name" text NOT NULL,
	"package_key" text NOT NULL,
	"repo_full_name" text,
	"repo_directory" text,
	"homepage" text,
	"weekly_downloads" integer,
	"first_published_at" timestamp with time zone,
	"funding_links" text[] DEFAULT '{}'::text[] NOT NULL,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "packages_package_key_unique" UNIQUE("package_key"),
	CONSTRAINT "packages_ecosystem_name_unique" UNIQUE("ecosystem","name")
);
--> statement-breakpoint
CREATE TABLE "payee_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"address" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payee_source" CHECK ("payee_observations"."source" in ('claim','drips','tea','npm_funding'))
);
--> statement-breakpoint
CREATE TABLE "screens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"chain_id" integer,
	"mapped_from" text,
	"response" jsonb NOT NULL,
	"status" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screens_kind" CHECK ("screens"."kind" in ('address','token','simulation'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"agent_key_id" uuid NOT NULL,
	"claude_session_id" text NOT NULL,
	"session_key" text NOT NULL,
	"repo_label" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"budget_micro" bigint,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"settle_requested_at" timestamp with time zone,
	"manifest_hash" text,
	"record_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_owner_id_claude_session_id_unique" UNIQUE("owner_id","claude_session_id"),
	CONSTRAINT "sessions_status" CHECK ("sessions"."status" in ('uploaded','settling','settled','failed'))
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"package_name" text NOT NULL,
	"version" text,
	"signal" text NOT NULL,
	"count" integer NOT NULL,
	"evidence" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "usage_session_id_package_name_signal_unique" UNIQUE("session_id","package_name","signal"),
	CONSTRAINT "usage_signal" CHECK ("usage"."signal" in ('dep_added','import','docs','read'))
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_maintainer_id_maintainers_id_fk" FOREIGN KEY ("maintainer_id") REFERENCES "public"."maintainers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_screen_id_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_observations" ADD CONSTRAINT "payee_observations_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_key_id_agent_keys_id_fk" FOREIGN KEY ("agent_key_id") REFERENCES "public"."agent_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payee_observations_pkg_time" ON "payee_observations" USING btree ("package_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "screens_cache" ON "screens" USING btree ("kind","subject","chain_id","fetched_at" DESC NULLS LAST);