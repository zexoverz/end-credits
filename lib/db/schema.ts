// Data model (DESIGN §3). Deviations recorded in docs/plan/decisions.md: USDC amounts are
// micro-USDC bigints (`*_micro`), and bytes32 values are 0x-hex text.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const micro = (name: string) => bigint(name, { mode: "bigint" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").defaultNow().notNull();

export const owners = pgTable(
  "owners",
  {
    id: uuid().defaultRandom().primaryKey(),
    iss: text(),
    sub: text(),
    subHash: text("sub_hash"),
    displayName: text("display_name").notNull(),
    payerAddress: text("payer_address").notNull(),
    sessionBudgetMicro: micro("session_budget_micro").notNull().default(sql`2000000`),
    packageCapMicro: micro("package_cap_micro").notNull().default(sql`250000`),
    dailyLimitMicro: micro("daily_limit_micro").notNull().default(sql`20000000`),
    holdTtlSeconds: integer("hold_ttl_seconds").notNull().default(86400),
    settleMode: text("settle_mode").notNull().default("auto"),
    approverAddress: text("approver_address"),
    /** The owner's own funding wallet: EndCreditsBudget pulls each session's spend from it. */
    budgetOwner: text("budget_owner"),
    walletAddress: text("wallet_address").unique(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.iss, t.sub),
    check("owners_settle_mode", sql`${t.settleMode} in ('auto','on_open')`),
  ],
);

/** SIWE nonces already spent: the cookie holds the live one, this row makes it single use. */
export const siweNonces = pgTable("siwe_nonces", {
  nonce: text().primaryKey(),
  usedAt: ts("used_at").defaultNow().notNull(),
});

export const agentKeys = pgTable(
  "agent_keys",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id),
    label: text().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    boundVia: text("bound_via").notNull(),
    createdAt: createdAt(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [check("agent_keys_bound_via", sql`${t.boundVia} in ('dev','device_grant')`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id),
    agentKeyId: uuid("agent_key_id").notNull().references(() => agentKeys.id),
    claudeSessionId: text("claude_session_id").notNull(),
    sessionKey: text("session_key").notNull(),
    repoLabel: text("repo_label"),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    budgetMicro: micro("budget_micro"),
    status: text().notNull().default("uploaded"),
    settleRequestedAt: ts("settle_requested_at"),
    manifestHash: text("manifest_hash"),
    recordTx: text("record_tx"),
    budgetPullTx: text("budget_pull_tx"),
    leftoverMicro: micro("leftover_micro"),
    returnTx: text("return_tx"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.ownerId, t.claudeSessionId),
    check("sessions_status", sql`${t.status} in ('uploaded','settling','settled','failed')`),
  ],
);

export const usage = pgTable(
  "usage",
  {
    id: uuid().defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id),
    packageName: text("package_name").notNull(),
    version: text(),
    signal: text().notNull(),
    count: integer().notNull(),
    evidence: text().array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    unique().on(t.sessionId, t.packageName, t.signal),
    check("usage_signal", sql`${t.signal} in ('dep_added','import','docs','read')`),
  ],
);

export const packages = pgTable(
  "packages",
  {
    id: uuid().defaultRandom().primaryKey(),
    ecosystem: text().notNull().default("npm"),
    name: text().notNull(),
    packageKey: text("package_key").notNull().unique(),
    repoFullName: text("repo_full_name"),
    repoDirectory: text("repo_directory"),
    homepage: text(),
    weeklyDownloads: integer("weekly_downloads"),
    firstPublishedAt: ts("first_published_at"),
    fundingLinks: text("funding_links").array().notNull().default(sql`'{}'::text[]`),
    fetchedAt: ts("fetched_at"),
    // From an uploaded package.json, used only when the npm registry 404s (decisions.md).
    declaredRepo: text("declared_repo"),
    declaredDirectory: text("declared_directory"),
    declaredHomepage: text("declared_homepage"),
    repoSource: text("repo_source"),
  },
  (t) => [
    unique().on(t.ecosystem, t.name),
    check("packages_repo_source", sql`${t.repoSource} in ('registry','declared')`),
  ],
);

export const payeeObservations = pgTable(
  "payee_observations",
  {
    id: uuid().defaultRandom().primaryKey(),
    packageId: uuid("package_id").notNull().references(() => packages.id),
    address: text().notNull(),
    source: text().notNull(),
    sourceUrl: text("source_url").notNull(),
    observedAt: ts("observed_at").defaultNow().notNull(),
  },
  (t) => [
    index("payee_observations_pkg_time").on(t.packageId, t.observedAt.desc()),
    check("payee_source", sql`${t.source} in ('claim','drips','tea','npm_funding')`),
  ],
);

export const screens = pgTable(
  "screens",
  {
    id: uuid().defaultRandom().primaryKey(),
    kind: text().notNull(),
    subject: text().notNull(),
    chainId: integer("chain_id"),
    mappedFrom: text("mapped_from"),
    response: jsonb().notNull(),
    status: integer().notNull(),
    latencyMs: integer("latency_ms").notNull(),
    fetchedAt: ts("fetched_at").defaultNow().notNull(),
  },
  (t) => [
    index("screens_cache").on(t.kind, t.subject, t.chainId, t.fetchedAt.desc()),
    check("screens_kind", sql`${t.kind} in ('address','token','simulation','impersonation')`),
  ],
);

export const credits = pgTable(
  "credits",
  {
    id: uuid().defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id),
    packageId: uuid("package_id").notNull().references(() => packages.id),
    score: integer().notNull(),
    amountMicro: micro("amount_micro").notNull(),
    capped: boolean().notNull().default(false),
    role: text().notNull(),
    payee: text(),
    payeeSource: text("payee_source"),
    outcome: text(),
    reasons: jsonb().notNull().default(sql`'[]'::jsonb`),
    screenIds: uuid("screen_ids").array().notNull().default(sql`'{}'::uuid[]`),
    tipId: text("tip_id"),
    txHash: text("tx_hash"),
    receipt: jsonb(),
    decidedAt: ts("decided_at"),
    settledAt: ts("settled_at"),
  },
  (t) => [
    unique().on(t.sessionId, t.packageId),
    check("credits_role", sql`${t.role} in ('starring','featuring','research','thanks')`),
    check(
      "credits_outcome",
      sql`${t.outcome} in ('paid','capped','held','refused','reserved','dust')`,
    ),
  ],
);

export const holds = pgTable(
  "holds",
  {
    id: uuid().defaultRandom().primaryKey(),
    creditId: uuid("credit_id").notNull().unique().references(() => credits.id),
    tipId: text("tip_id").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    status: text().notNull().default("pending"),
    holdTx: text("hold_tx").notNull(),
    releaseTx: text("release_tx"),
    refundTx: text("refund_tx"),
    returnTx: text("return_tx"),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    check("holds_status", sql`${t.status} in ('pending','released','denied','expired')`),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid().defaultRandom().primaryKey(),
    holdId: uuid("hold_id").notNull().references(() => holds.id),
    ownerId: uuid("owner_id").notNull().references(() => owners.id),
    method: text().notNull(),
    payload: jsonb(),
    nonce: text().unique(),
    state: text().unique(),
    codeVerifierEnc: text("code_verifier_enc"),
    startedAt: ts("started_at").notNull(),
    status: text().notNull(),
    failureCode: text("failure_code"),
    authTime: ts("auth_time"),
    acr: text(),
    amr: text().array(),
    completedAt: ts("completed_at"),
    approvalRef: text("approval_ref"),
    releaseDeadline: bigint("release_deadline", { mode: "bigint" }),
    releaseSignature: text("release_signature"),
  },
  (t) => [
    check("approvals_method", sql`${t.method} in ('session','world')`),
    check("approvals_status", sql`${t.status} in ('pending','approved','failed')`),
  ],
);

export const maintainers = pgTable("maintainers", {
  id: uuid().defaultRandom().primaryKey(),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  githubLogin: text("github_login").notNull(),
  tokenEnc: text("token_enc"),
  createdAt: createdAt(),
});

export const claims = pgTable(
  "claims",
  {
    id: uuid().defaultRandom().primaryKey(),
    repoFullName: text("repo_full_name").notNull(),
    maintainerId: uuid("maintainer_id").notNull().references(() => maintainers.id),
    walletAddress: text("wallet_address"),
    walletKind: text("wallet_kind").default("coinbase_smart_wallet"),
    prNumber: integer("pr_number"),
    prUrl: text("pr_url"),
    prMode: text("pr_mode"),
    mergedSha: text("merged_sha"),
    verifiedFundingSha: text("verified_funding_sha"),
    screenId: uuid("screen_id").references(() => screens.id),
    setClaimTx: text("set_claim_tx"),
    claimTxs: text("claim_txs").array().notNull().default(sql`'{}'::text[]`),
    claimedMicro: micro("claimed_micro"),
    status: text().notNull().default("started"),
    failureCode: text("failure_code"),
    createdAt: createdAt(),
  },
  (t) => [
    check("claims_pr_mode", sql`${t.prMode} in ('api','new_file_link')`),
    check(
      "claims_status",
      sql`${t.status} in ('started','wallet','pr_open','merged','verified','claimed','refused')`,
    ),
  ],
);

export const deviceSessions = pgTable("device_sessions", {
  id: uuid().defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => owners.id),
  deviceCodeEnc: text("device_code_enc"),
  userCode: text("user_code"),
  verificationUri: text("verification_uri"),
  expiresAt: ts("expires_at"),
  status: text().notNull().default("pending"),
});

export const notifications = pgTable("notifications", {
  id: uuid().defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id),
  kind: text().notNull(),
  holdId: uuid("hold_id").references(() => holds.id),
  createdAt: createdAt(),
  readAt: ts("read_at"),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid().defaultRandom().primaryKey(),
  eventId: text("event_id").notNull().unique(),
  kind: text().notNull(),
  payload: jsonb().notNull(),
  receivedAt: ts("received_at").defaultNow().notNull(),
});
