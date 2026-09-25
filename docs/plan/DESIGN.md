# End Credits: technical design

Plan written 25 Sep 2026, after hacking started. `SPEC.md` says what and why; this file says exactly
how, so a ticket can be executed without guessing. Where a library detail must be checked it is
marked **CONFIRM**, and the confirmed choice goes into `docs/plan/decisions.md` before the ticket that
depends on it.

---

## 1. Repository layout

```
app/
  page.tsx                          landing: one line, how it works, "not a paywall", measured facts
  credits/[sessionId]/page.tsx      the credits roll
  dashboard/page.tsx                MultiBaas-backed totals
  npm/[...name]/page.tsx            package page: reserved balance, claim flow
  approve/[tipId]/page.tsx          phone page: approve or deny one held tip
  owner/page.tsx                    budget, cap, payer wallet, agent keys, pending holds
  history/page.tsx                  every decision with its reasons
  api/health/route.ts
  api/auth/world/start/route.ts     owner sign-in (E11)
  api/auth/world/callback/route.ts
  api/auth/dev/route.ts             owner dev login, disabled when WORLD_REQUIRED=true
  api/auth/logout/route.ts
  api/owner/settings/route.ts
  api/owner/keys/route.ts
  api/agent/device/start/route.ts   CLI login via device grant (P1)
  api/agent/device/poll/route.ts
  api/sessions/route.ts             POST: CLI uploads an attributed session
  api/sessions/[id]/route.ts        GET: roll state (polled)
  api/sessions/[id]/settle/route.ts POST: "Roll credits" (settle_mode on_open)
  api/sessions/[id]/manifest/route.ts
  api/x402/credit/[creditId]/route.ts
  api/approve/[tipId]/start/route.ts
  api/approve/callback/route.ts
  api/approve/[tipId]/deny/route.ts
  api/github/login/route.ts
  api/github/callback/route.ts
  api/claim/[...name]/wallet/route.ts
  api/claim/[...name]/pr/route.ts
  api/claim/[...name]/status/route.ts
  api/dashboard/route.ts            MultiBaas event query proxy, 15 s cache
  api/webhooks/multibaas/route.ts
lib/
  db/schema.ts, db/client.ts
  attribution/signals.ts, attribution/specifier.ts, attribution/score.ts   (shared with cli/)
  allocation/split.ts
  registry/npm.ts                   npm registry + downloads API
  payee/resolve.ts, payee/parse.ts, payee/observe.ts
  intercepta/client.ts, intercepta/cache.ts, intercepta/mapping.ts
  decision/matrix.ts, decision/lookalike.ts, decision/spam.ts (P1)
  x402/server.ts, x402/client.ts
  chain/escrow.ts, chain/keys.ts, chain/txqueue.ts
  multibaas/client.ts, multibaas/queries.ts, multibaas/webhook.ts
  world/oidc.ts, world/stepup.ts, world/device.ts, world/verify.ts
  github/oauth.ts, github/claim.ts
  messages.ts                       every user-facing string, one place
cli/
  src/index.ts                      endcredits init | key | login | start | record | settle | attribute
  src/ledger.ts, src/hooks.ts, src/upload.ts
worker/
  settler.ts                        settlement loop
  expirer.ts                        refunds expired holds
contracts/
  src/EndCreditsEscrow.sol
  test/EndCreditsEscrow.t.sol, test/EndCreditsEscrow.invariant.t.sol, test/mocks/MockUSDC.sol
  script/Deploy.s.sol               MultiBaas Forge plugin (CONFIRM)
scripts/
  seed.ts, measure-funding.py, probe-intercepta.ts, probe-payees.ts, publish-fixtures.sh
fixtures/
  moved-payout/, left-padder-pro/, unclaimed-utils/   the three @endcredits-demo packages
docs/plan/                          SPEC (no §3 estimates), DESIGN, TICKETS, AGENTS
docs/plan/decisions.md              choices confirmed during the build
docs/intercepta-probe.md            real responses captured by probe-intercepta
AI_USAGE.md
AGENTS.md
README.md
```

## 2. Environment

| Var | Used by | P |
|---|---|---|
| `APP_URL` | every callback; must equal the fixed Railway domain | P0 |
| `DATABASE_URL` | Drizzle | P0 |
| `SESSION_SECRET` | iron-session cookie encryption (32+ bytes) | P0 |
| `OWNER_DEV_TOKEN` | dev owner login until World ships | P0 |
| `WORLD_REQUIRED` | `true` disables dev login and session-only approval | P1 |
| `INTERCEPTA_API_KEY`, `INTERCEPTA_BASE` = `https://api.web3antivirus.io` | screening | P0 |
| `BASE_SEPOLIA_RPC` | viem | P0 |
| `USDC_ADDRESS` = `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | pin | P0 |
| `ESCROW_ADDRESS` | escrow calls | P0 |
| `PAYER_PRIVATE_KEY` | payer wallet: x402 signatures, `hold`, `reserve` | P0 |
| `RECORDER_PRIVATE_KEY` | `release`, `refund`, `setClaim`, `claim`, `recordSession` | P0 |
| `X402_FACILITATOR_URL` | x402 (**CONFIRM**) | P0 |
| `RECEIPT_SIGNING_KEY` | signs x402 credit receipts | P0 |
| `MULTIBAAS_URL`, `MULTIBAAS_API_KEY` | dashboard, deploy | P0 |
| `MULTIBAAS_WEBHOOK_SECRET` | webhook signature | P0 |
| `GITHUB_TOKEN_READ` | server-side reads of FUNDING files and repos (rate limit) | P0 |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | maintainer sign-in | P0 |
| `NEXT_PUBLIC_CB_APP_NAME` | Coinbase Smart Wallet SDK (**CONFIRM** required config) | P0 |
| `WORLD_ISSUER` = `https://auth.world.org` | OIDC | P1 (E11) |
| `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET` | confidential client | P1 (E11) |
| `APPROVE_SALT` | step-up nonce | P1 (E11) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | held notification | P2 |

Boot check: a missing P0 var throws `Missing required env: <NAME>` before the server listens. E11 vars
become required when `WORLD_REQUIRED=true`. Testnet keys only: `zexo-main` is the payer,
`zexo-secondary` the recorder (dev-wallet skill). Keys are read from env, never logged.

## 3. Data model (Drizzle, Postgres)

```
owners
  id uuid pk
  iss text, sub text                     -- null until World sign-in (E11)
  sub_hash bytea                         -- keccak256(iss || sub)
  display_name text not null
  payer_address text not null
  session_budget_usdc numeric not null default 2
  package_cap_usdc numeric not null default 0.25
  daily_limit_usdc numeric not null default 20
  hold_ttl_seconds int not null default 86400
  settle_mode text not null default 'auto' check (settle_mode in ('auto','on_open'))
  created_at timestamptz default now()
  unique (iss, sub)

agent_keys
  id uuid pk
  owner_id uuid fk owners
  label text not null                    -- "MacBook, Claude Code"
  token_hash bytea not null unique       -- sha256 of the key
  bound_via text not null check (bound_via in ('dev','device_grant'))
  created_at timestamptz default now()
  revoked_at timestamptz

sessions
  id uuid pk
  owner_id uuid fk owners
  agent_key_id uuid fk agent_keys
  claude_session_id text not null
  session_key bytea not null             -- keccak256(id), used on-chain
  repo_label text                        -- user-chosen, never a path
  started_at timestamptz, ended_at timestamptz
  budget_usdc numeric                    -- set at settle (after daily limit)
  status text not null default 'uploaded' check (status in ('uploaded','settling','settled','failed'))
  manifest_hash bytea
  record_tx text
  created_at timestamptz default now()
  unique (owner_id, claude_session_id)

usage
  id uuid pk
  session_id uuid fk sessions
  package_name text not null
  version text
  signal text not null check (signal in ('dep_added','import','docs','read'))
  count int not null                     -- after per-signal caps
  evidence text[] not null default '{}'  -- in-package paths or docs URLs, max 10
  unique (session_id, package_name, signal)

packages
  id uuid pk
  ecosystem text not null default 'npm'
  name text not null
  package_key bytea not null unique      -- keccak256("npm:" || name)
  repo_full_name text                    -- "tanstack/query"
  repo_directory text
  homepage text
  weekly_downloads int
  first_published_at timestamptz
  funding_links text[] not null default '{}'   -- Sponsors / Open Collective URLs
  fetched_at timestamptz
  unique (ecosystem, name)

payee_observations
  id uuid pk
  package_id uuid fk packages
  address text not null                  -- checksummed
  source text not null check (source in ('claim','drips','tea','npm_funding'))
  source_url text not null
  observed_at timestamptz default now()
  -- index (package_id, observed_at desc)

credits
  id uuid pk
  session_id uuid fk sessions
  package_id uuid fk packages
  score numeric not null
  share numeric not null                 -- 0..1 before cap
  amount_usdc numeric not null           -- after cap and floor
  capped boolean not null default false
  role text not null check (role in ('starring','featuring','research','thanks'))
  payee text
  payee_source text
  outcome text check (outcome in ('paid','capped','held','refused','reserved','dust'))
  reasons jsonb not null default '[]'    -- [{source:'intercepta'|'policy'|'payee', code, text}]
  screen_ids uuid[] not null default '{}'
  tip_id bytea                           -- keccak256(abi.encode(session_key, package_key))
  tx_hash text                           -- x402 settlement, hold, or reserve tx
  receipt jsonb                          -- x402 credit receipt
  decided_at timestamptz, settled_at timestamptz
  unique (session_id, package_id)

screens
  id uuid pk
  kind text not null check (kind in ('address','token','simulation'))
  subject text not null
  chain_id int
  mapped_from text                       -- "base-sepolia:0x036C…"
  response jsonb not null
  status int not null
  latency_ms int not null
  fetched_at timestamptz default now()
  -- cache key (kind, subject, chain_id), ttl 1 h

holds
  id uuid pk
  credit_id uuid fk credits unique
  tip_id bytea not null unique
  expires_at timestamptz not null
  status text not null default 'pending'
    check (status in ('pending','released','denied','expired'))
  hold_tx text not null, release_tx text, refund_tx text
  resolved_at timestamptz

approvals
  id uuid pk
  hold_id uuid fk holds
  owner_id uuid fk owners
  method text not null check (method in ('session','world'))
  payload jsonb, nonce text unique, state text unique, code_verifier_enc text
  started_at timestamptz not null
  status text not null check (status in ('pending','approved','failed'))
  failure_code text
  auth_time timestamptz, acr text, amr text[]
  completed_at timestamptz

maintainers
  id uuid pk
  github_id bigint not null unique
  github_login text not null
  token_enc text not null                -- encrypted OAuth token, deleted after the claim
  created_at timestamptz default now()

claims
  id uuid pk
  repo_full_name text not null
  maintainer_id uuid fk maintainers
  wallet_address text
  wallet_kind text default 'coinbase_smart_wallet'
  pr_number int, pr_url text, pr_mode text check (pr_mode in ('api','new_file_link'))
  merged_sha text
  verified_funding_sha text
  screen_id uuid fk screens
  set_claim_tx text, claim_txs text[] not null default '{}'
  status text not null default 'started'
    check (status in ('started','wallet','pr_open','merged','verified','claimed','refused'))
  failure_code text
  created_at timestamptz default now()

device_sessions (P1)
  id uuid pk, owner_id uuid null, device_code_enc text, user_code text, verification_uri text,
  expires_at timestamptz, status text default 'pending'

notifications
  id uuid pk, owner_id uuid fk owners, kind text, hold_id uuid null, created_at, read_at

webhook_events
  id uuid pk, event_id text unique, kind text, payload jsonb, received_at timestamptz default now()
```

## 4. CLI and hooks

### 4.1 Install (`endcredits init`)

Writes to `.claude/settings.json` (project) or `~/.claude/settings.json` with `--global`, merging with
existing hooks, never replacing them:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "endcredits start" }] }],
    "PostToolUse": [{ "matcher": "Read|Grep|Glob|Write|Edit|MultiEdit|WebFetch|Bash",
                      "hooks": [{ "type": "command", "command": "endcredits record" }] }],
    "SessionEnd":   [{ "hooks": [{ "type": "command", "command": "endcredits settle" }] }]
  }
}
```

**CONFIRM** against current Claude Code docs: event names, the matcher syntax, and the stdin fields
used below (`session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`, `reason`). Config lives
in `~/.endcredits/config.json` (`{apiUrl, agentKey}`, mode 600).

### 4.2 `endcredits start` (SessionStart)

Reads stdin, snapshots `dependencies ∪ devDependencies` of `cwd/package.json` into
`~/.endcredits/sessions/<session_id>.start.json`. Exit 0 always.

### 4.3 `endcredits record` (PostToolUse)

Reads stdin, extracts at most one candidate line, appends it to
`~/.endcredits/sessions/<session_id>.jsonl`. No network, no parsing of anything but the tool input.
Budget: < 50 ms. **Always exit 0, write nothing to stdout.** Any exception is appended to
`~/.endcredits/errors.log`.

| `tool_name` | Field | Line written |
|---|---|---|
| `Read` | `tool_input.file_path` | `{t:"read", p:<path>}` if it contains `/node_modules/` |
| `Grep`, `Glob` | `tool_input.path` | same |
| `Write` | `tool_input.content` | `{t:"code", f:sha256(file_path), specs:[...]}` |
| `Edit` | `tool_input.new_string` | same |
| `MultiEdit` | `tool_input.edits[].new_string` | same |
| `WebFetch` | `tool_input.url` | `{t:"docs", u:<url>}` |
| `Bash` | `tool_input.command` | `{t:"add", pkgs:[...]}` if it matches `(npm (i|install|add)|pnpm add|yarn add|bun add)` |

`specs` are raw import specifiers extracted with the regexes in `lib/attribution/specifier.ts`:
`import … from '(x)'`, `import '(x)'`, `export … from '(x)'`, `require\('(x)'\)`, `import\('(x)'\)`.
File paths are hashed before they are written; only the hash is kept, for distinct-file counting.

### 4.4 `endcredits settle` (SessionEnd)

1. Read the ledger and the start snapshot; read `cwd/package.json` again.
2. Attribute (§5) with the installed-package check against `cwd/node_modules`.
3. `POST {apiUrl}/api/sessions` with `Authorization: Bearer <agentKey>`, body §6.1, timeout 5 s.
4. Print `End Credits: rolling credits at {APP_URL}/credits/{id}` to stderr and `open` the URL.
5. On failure keep the ledger; `endcredits settle --session <id>` retries.

`endcredits attribute --session <id>` prints the attribution table without uploading (tests and demo
prep).

## 5. Attribution algorithm (`lib/attribution/`)

```ts
type Signal = 'dep_added' | 'import' | 'docs' | 'read';
const WEIGHT = { dep_added: 5, import: 3, docs: 2, read: 1 } as const;
const CAP    = { dep_added: 1, import: 5, docs: 5, read: 10 } as const;  // distinct items
```

**Specifier → package** (`specifier.ts`):
1. Skip if it starts with `.`, `/`, `node:`, `@/`, `~/`, `#`, or is in `module.builtinModules`.
2. `@scope/name/...` → `@scope/name`; `name/...` → `name`.
3. Validate with the npm name rule `^(?:@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$`, length
   ≤ 214. Invalid → skipped.

**Path → package** (read signals): take the text after the **last** `/node_modules/`, then the first
segment, or the first two if the first starts with `@`. This handles pnpm's
`node_modules/.pnpm/zod@3.23.8/node_modules/zod/…`. The evidence kept is the path inside the package.

**Docs URL → package**: match against the installed set only. For each installed package with
registry metadata: host equals the `homepage` host; or URL starts with its GitHub repo URL; or path
is `/package/<name>` on `npmjs.com`, or `/<name>@` / `/npm/<name>@` on `unpkg.com` / `cdn.jsdelivr.net`.
Ambiguous host (several packages share it, e.g. a monorepo site) → credit the one whose name appears
in the URL path, else the first alphabetically, and record `ambiguous` in evidence.

**dep_added**: `keys(end deps) − keys(start deps)` ∪ packages from `add` lines, intersected with the
installed set.

**Installed set**: package names for which `cwd/node_modules/<name>/package.json` exists at settle.
Anything else is dropped. `import` and `dep_added` also require the package to be in `cwd/package.json`
deps (direct dependencies only); `read` does not.

**Score**: `Σ_signal WEIGHT[s] × min(distinct items, CAP[s])`.

**Role** (for the roll): top 3 by score → `starring`; else the signal with the largest weighted
contribution: `import`/`dep_added` → `featuring`, `docs` → `research`, `read` → `thanks`.

## 6. Session API

### 6.1 `POST /api/sessions`

```json
{ "claudeSessionId": "…", "repoLabel": "reports-app", "startedAt": "…", "endedAt": "…",
  "packages": [ { "name": "zod", "version": "3.23.8",
                  "signals": { "import": { "count": 4 }, "read": { "count": 7, "evidence": ["zod/lib/types.d.ts"] } } } ] }
```
Auth: bearer agent key → `agent_keys.token_hash`; revoked → 401. Validates names with §5 rule, counts
≤ caps, ≤ 200 packages. Idempotent on `(owner, claudeSessionId)`. Response `{id, url}`. If the
owner's `settle_mode` is `auto`, enqueue settlement.

### 6.2 `GET /api/sessions/:id`

Public read (the roll is shareable): session status, credits in roll order with outcome, amount,
reasons, tx links. Payee addresses are shown shortened. Polled every 1 s by the roll.

### 6.3 `POST /api/sessions/:id/settle`

Owner session required. `uploaded` → enqueue; any other status → 409.

## 7. Settlement (`worker/settler.ts`)

Loop every 2 s: claim one session with `status='uploaded'` and a settle request (`FOR UPDATE SKIP
LOCKED`), mark `settling`.

```
B = min(owner.session_budget, owner.daily_limit - spentToday(owner))
if B <= 0: session settled, all credits outcome 'dust' with reason DAILY_LIMIT ; return
credits = split(scores, B, owner.package_cap)                         -- §7.1
for each credit (concurrency 3, ordered by amount desc):
  pkg    = registry.load(name)                                        -- npm registry, cached 1 h
  payee  = resolvePayee(pkg)                                          -- §7.2 ; writes an observation
  if !payee: outcome reserved ; escrow.reserve(packageKey, amount, sessionKey) ; continue
  screen = intercepta.screenPayee(payee)                              -- §9
  d      = decide({...})                                              -- §8
  record decision (decided_at) BEFORE any signature
  switch d.outcome:
    paid|capped -> x402.payCredit(credit)                             -- §10
    held        -> escrow.hold(tipId, packageKey, payee, amount, reasonCode, owner.hold_ttl)
    refused     -> nothing
    dust        -> nothing
manifest = canonical JSON of all credits ; manifest_hash = keccak256
escrow.recordSession(sessionKey, owner.sub_hash or keccak(owner.id), totals, manifest_hash)
status settled
```

Chain txs from one key go through `chain/txqueue.ts` (one in flight per key, nonce from the node,
retry once on `nonce too low`). x402 payments are signatures, submitted by the facilitator, so they
run in parallel.

Setup (once, `scripts/seed.ts`): payer approves the escrow for USDC (`approve(escrow, 1000e6)`).

### 7.1 Split (`lib/allocation/split.ts`)

```ts
split(scores: Map<string, number>, budget: bigint /*6dp*/, cap: bigint): Map<string, {amount: bigint, capped: boolean}>
```
1. `active = all with score > 0`, `remaining = budget`.
2. Loop: `total = Σ score(active)`; for each active `a = remaining × score / total` (bigint, floor).
   If none exceeds `cap` → assign and stop. Else set each over-cap package to `cap`, `capped = true`,
   remove it from `active`, subtract its cap from `remaining`, repeat.
3. If `active` empties, the leftover is unspent.
4. Any `amount < 10_000` (0.01 USDC) → `dust`, amount 0.

Property tests: `Σ amounts ≤ budget`; no amount > cap; with no caps hit, amounts are proportional
within 1 micro-USDC per package; adding score to one package never lowers its amount.

### 7.2 Payee resolution (`lib/payee/resolve.ts`)

Order, first hit wins:
1. `claims` (on-chain `claimOf(packageKey)` via viem; mirrored in DB) → source `claim`.
2. `https://raw.githubusercontent.com/{repo}/HEAD/FUNDING.json` → `json.drips.ethereum.ownedBy`
   → source `drips`.
3. `https://raw.githubusercontent.com/{repo}/HEAD/tea.yaml` → `codeOwners[0]` if `quorum == 1` →
   source `tea`. (**CONFIRM** tea.yaml field names against a real file, e.g. `colinhacks/zod`.)
4. npm `funding` of the installed version containing `0x[0-9a-fA-F]{40}` → source `npm_funding`.
5. None.

Every address is checksummed with viem `getAddress`; an invalid one counts as none and records
`reason PAYEE_INVALID`. Each resolution writes `payee_observations`.

`recentlyChanged(pkg, address)`: exists an observation for `pkg` with a different address and
`observed_at > now − 30 days` → `{changed: true, days}`.

Registry (`lib/registry/npm.ts`): `GET https://registry.npmjs.org/{name}` (versions, `time.created`,
`repository`, `homepage`, `funding`), `GET https://api.npmjs.org/downloads/point/last-week/{name}`.
Repo from `repository.url` with the same regex as `measure-funding.py`.

## 8. Decision matrix (`lib/decision/matrix.ts`)

```ts
type Screen = {
  toxicScore: number;
  traits: { name: string; description: string }[];
  tokenAction: 'block' | 'warn' | 'info';
  tokenDetectors: { code: string; description: string }[];
  error?: 'TIMEOUT' | 'HTTP' | 'PARSE';
};
type DecideInput = {
  payee: `0x${string}` | null;
  paymentToken: `0x${string}`;
  screen: Screen | null;                          // null only when payee is null
  capped: boolean;
  amount: bigint;
  change: { changed: boolean; days?: number };
  lookalike: { of: `0x${string}`; pkg: string } | null;   // lib/decision/lookalike.ts
  spam: { count: number } | null;                          // P1, lib/decision/spam.ts
  noCodeOnBase: boolean;                                   // P1
};
type Decision = { outcome: 'paid'|'capped'|'held'|'refused'|'reserved'; reasons: Reason[]; holdReason?: HoldReason };
const CRITICAL = new Set(['sanction_address', 'known_scammer', 'blacklist', 'fake_phishing_transfer']);
```

Evaluation order (first match wins), each with its message code (§11):
1. `payee == null` → `reserved` [`RESERVED`].
2. `paymentToken != USDC_ADDRESS` → `refused` [`TOKEN_PIN`]; `screen.tokenAction == 'block'` →
   `refused` [token detector descriptions].
3. `screen.error` → `held` [`SCREEN_UNAVAILABLE`], holdReason `SCREEN`.
4. any trait in `CRITICAL`, or `toxicScore > 50` → `refused` [trait descriptions verbatim, prefixed
   `Intercepta:`]; `lookalike` → `refused` [`LOOKALIKE`]; `spam.count >= 5` → `refused` [`SPAM`].
5. `change.changed` → `held` [`HELD_CHANGED`], holdReason `ADDRESS_CHANGED`.
6. `20 <= toxicScore <= 50` or `tokenAction == 'warn'` → `held` [`HELD_MEDIUM`], holdReason `MEDIUM`.
7. `noCodeOnBase` → `held` [`HELD_NO_CODE`], holdReason `NO_CODE`.
8. `capped` → `capped` [`CAPPED`]; else `paid` [`PAID`].

Every result also carries `SCREENED_AS` when a screen ran.

`lookalike.ts`: compare the payee against every payee observed for other packages (and every claimed
payee): same lowercase first 4 and last 4 hex after `0x`, different address → match. Our rule, not
Intercepta's; labelled so.

`spam.ts` (P1): within this session, count packages whose payee equals this one and whose
`weekly_downloads < 1000` or `first_published_at > now − 30 days`.

`noCodeOnBase` (P1): `getCode(payee)` on Ethereum mainnet non-empty and on Base mainnet empty. Needed
before any mainnet round.

hold reason codes on-chain: `1 ADDRESS_CHANGED`, `2 MEDIUM`, `3 SCREEN`, `4 NO_CODE`.

## 9. Intercepta client (`lib/intercepta/`)

```ts
quickScan(address): Promise<{toxicScore, traits}>            // GET /api/public/v2/extension/account/{a}/quick-scan
tokenRisks(address, chainId): Promise<{action, riskLevel, detectors}>  // GET /api/public/v2/extension/token-intelligence/token/{a}/risks?chainId=
simulateTransfer({from, to, amount}): Promise<{detectors, assetsMovement}>  // POST /api/public/v1/extension/simulation/transaction?chainId=8453
screenPayee(payee): Promise<Screen>
```
- Header `X-API-KEY`. Timeout 8 s via `AbortController`. Every call stored in `screens` with latency.
- Cache: same `(kind, subject, chain_id)` within 1 h reuses the row. Token risks once per session.
- Mapping: payment token Base Sepolia USDC is screened as Base USDC
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, chain 8453. UI shows `SCREENED_AS` under every result.
- Simulation runs only if `quickScan` errors; if both fail → `error` set → held.
- Impersonation endpoint: if the probe (T4.1) finds one, `screenPayee` calls it and a positive result
  joins rule 4 as an Intercepta reason (**CONFIRM**).
- Claim screening reuses `quickScan`; critical or > 50 → claim `refused` [`CLAIM_REFUSED`].

## 10. x402 (`lib/x402/`)

```
Settler: GET /api/x402/credit/{creditId}
Server:  load credit; require outcome in (paid, capped) and a screen for credit.payee newer than 10 min
           -> else 409 {code: NOT_PAYABLE}
         402 {accepts:[{scheme:'exact', network:'eip155:84532', asset:USDC_ADDRESS,
                        amount: credit.amount, payTo: credit.payee,
                        resource, description:"End Credits: {package}, session {short id}"}]}
Settler: beforeSign(challenge):
           challenge.payTo == credit.payee   else refuse PAYTO_MISMATCH
           challenge.asset == USDC_ADDRESS   else refuse TOKEN_PIN
           challenge.network == 'eip155:84532', amount <= credit.amount   else refuse CHALLENGE_MISMATCH
         only then build the EIP-3009 authorization and retry with the payment header
Server:  verify + settle through the facilitator ; on success store tx hash, return
         receipt {creditId, package, amount, payee, tx, sig: RECEIPT_SIGNING_KEY over the JSON}
```
**CONFIRM** at T5.1: the v2 package names, header names, the hook point for `beforeSign` in the client
(if the client has none, wrap the signer so it throws unless `decide()` returned paid/capped for this
credit and the challenge checks passed), and the Base Sepolia facilitator URL.

## 11. Messages (`lib/messages.ts`)

All user-facing strings live here so the UI, tests and README quote the same text.

| Code | Text |
|---|---|
| PAID | `Paid {amount} USDC.` |
| CAPPED | `Capped at {amount} USDC, the per-package limit for this session.` |
| HELD_CHANGED | `Held: the funding address for {package} changed {days} days ago. Waiting for the owner.` |
| HELD_MEDIUM | `Held: Intercepta rates this address medium risk ({score}). Waiting for the owner.` |
| HELD_NO_CODE | `Held: {address} is a contract on Ethereum with no code on Base.` |
| SCREEN_UNAVAILABLE | `Held: screening unavailable ({error}). Nothing is paid without a screen.` |
| REFUSED_TRAIT | `Refused. Intercepta: {description}` |
| TOKEN_PIN | `Refused: the payment token is not Base Sepolia USDC.` |
| LOOKALIKE | `Refused: {address} looks like {known} ({knownPackage}) but is a different address.` |
| SPAM | `Refused: this address is the payee of {count} packages in this session, each new or under 1,000 weekly downloads.` |
| PAYTO_MISMATCH | `Refused: the payment request names a different address than the one screened.` |
| CHALLENGE_MISMATCH | `Refused: the payment request does not match this credit.` |
| RESERVED | `Reserved {amount} USDC for {package}. No wallet yet; the maintainer can claim it.` |
| DUST | `Under 0.01 USDC. Not sent.` |
| DAILY_LIMIT | `Daily limit reached. Nothing was sent.` |
| PAYEE_INVALID | `The funding file names an invalid address.` |
| SCREENED_AS | `Screened as its mainnet equivalent (Base, chain 8453).` |
| APPROVED | `Approved with World ID. Released {amount} USDC to {address}.` |
| APPROVED_SESSION | `Approved by the owner. Released {amount} USDC to {address}.` |
| DENIED | `Denied. {amount} USDC returned to the owner.` |
| EXPIRED | `Not approved in time. {amount} USDC returned to the owner.` |
| CANCELLED | `Verification cancelled. Nothing was released.` |
| STALE_AUTH | `A fresh verification is required. Nothing was released.` |
| WRONG_HUMAN | `This approval belongs to a different human.` |
| NONCE | `This verification was not issued for this approval.` |
| ACR | `A proof-of-human credential is required.` |
| APPROVE_SENTENCE | `Release {amount} USDC to {address} for {package}.` |
| CLAIM_HEADLINE | `Agents set aside {amount} USDC for {package} from {sessions} sessions.` |
| NO_PERMISSION | `You need push or admin access to {repo} to claim for {package}.` |
| PR_OPENED | `Pull request #{number} opened. Merge it to claim; merging is the proof that you control this repository.` |
| PR_WAITING | `Waiting for #{number} to be merged.` |
| FUNDING_MISMATCH | `FUNDING.json on {branch} names {found}, not your wallet {expected}.` |
| CLAIM_REFUSED | `This address cannot receive funds. Intercepta: {description}` |
| CLAIMED | `Claimed {amount} USDC to {address}.` |
| ALREADY_PAYABLE | `{package} already lists a wallet. Agents pay it directly.` |
| COOLING | `The funding address changed. Claims reopen at {time}.` |
| NOT_A_PAYWALL | `End Credits is opt-in for whoever runs the agent. Packages stay free for everyone.` |
| ROLL_TITLE | `This session was made possible by` |

## 12. Pages

| Page | Shows | States |
|---|---|---|
| `/` | one line, three steps, NOT_A_PAYWALL, the 41.6% / 2.1% measurement, links to dashboard and a sample roll | static |
| `/credits/[id]` | black film screen; ROLL_TITLE; rows by role with name, main signal and count, amount, badge, reason line, Basescan link; owner sees **Roll credits** in `on_open` mode; totals line at the end ("Paid X to N projects. Held Y. Reserved Z for M projects without a wallet. Refused W.") | uploaded / settling (rows resolve one by one) / settled |
| `/dashboard` | cards: paid to maintainers, projects credited, held (approved / denied / expired), refused addresses, reserved waiting; table: package, sessions, paid, reserved, last decision; recent events; footer "data: MultiBaas event queries" and the escrow address | loading / data / MultiBaas unreachable (shows the error, never falls back to invented numbers) |
| `/npm/[name]` | CLAIM_HEADLINE; also-accepts links; four steps (GitHub, passkey wallet, PR, merge); status of an open claim; ALREADY_PAYABLE when a payee exists | nothing reserved / reserved / claim in progress / claimed / refused |
| `/approve/[tipId]` | phone-first: package, amount, payee (full), reason held, APPROVE_SENTENCE, **Approve with World ID** (or **Approve** before E11), **Deny**, expiry countdown | pending / approved / denied / expired / failed with message |
| `/owner` | budget, cap, daily limit, TTL, settle mode; payer address and USDC balance; agent keys (create, revoke); pending holds; notifications | signed out / signed in |
| `/history` | every credit decided: outcome badge, amount, reasons, screens (latency, "screened as mainnet") | n/a |

Design follows `storyboard.html`: warm paper background, film-black roll, one accent per badge:
paid green, capped blue, held amber, refused red, reserved violet. Legible at projector distance.

## 13. Maintainer claim (`lib/github/claim.ts`)

```
GET  /api/github/login?pkg=  -> 302 github.com/login/oauth/authorize?client_id&scope=public_repo&state   (CONFIRM scope)
GET  /api/github/callback    -> exchange code; GET /user ; upsert maintainers ; session.maintainerId ; 302 /npm/{pkg}
POST /api/claim/{pkg}/wallet {address}
       require maintainer session
       repo = packages.repo_full_name ; GET /repos/{repo} with the user token
       require permissions.push || permissions.admin          -> else 403 NO_PERMISSION
       require no existing payee (resolve) else 409 ALREADY_PAYABLE
       claims row status 'wallet', wallet_address = address   (from the Coinbase Smart Wallet SDK on the client)
POST /api/claim/{pkg}/pr
       base = default branch ; head sha = GET /repos/{repo}/git/ref/heads/{base}
       POST /repos/{repo}/git/refs  ref=refs/heads/endcredits/funding-json
       PUT  /repos/{repo}/contents/FUNDING.json  (branch endcredits/funding-json)
            content = {"drips":{"ethereum":{"ownedBy":"<wallet>"}}} + "\n"
       POST /repos/{repo}/pulls  title "Add FUNDING.json", body: two lines, what it is and that it only adds a wallet address
       any 403/404 from GitHub -> pr_mode 'new_file_link':
            https://github.com/{repo}/new/{base}?filename=FUNDING.json&value=<urlencoded json>
       status 'pr_open'
GET  /api/claim/{pkg}/status   (page polls every 5 s; "Check now" button)
       GET /repos/{repo}/pulls/{n} -> merged? (new_file_link mode: skip, go to the file check)
       GET /repos/{repo}/contents/FUNDING.json?ref={base} -> parse ownedBy
       ownedBy != wallet -> FUNDING_MISMATCH
       status 'merged' -> screen wallet (quickScan) -> critical or > 50 -> 'refused' CLAIM_REFUSED
       recorder: setClaim(packageKey, wallet, evidence = keccak256(repo || merged_sha)) for every package
                 of this repo that has a reserve ; then claim(packageKey) for each
       status 'claimed'; delete token_enc
```

Client wallet: Coinbase Smart Wallet SDK (or wagmi's `coinbaseWallet` connector) with smart-wallet
only, chain Base Sepolia; the address is read after the passkey is created. **CONFIRM** the SDK and
option names at T10.2.

## 14. World ID (`lib/world/`), built in E11

### 14.1 Owner sign-in (code + PKCE)

```
GET /api/auth/world/start
  state, nonce, code_verifier -> encrypted cookie (10 min)
  302 {issuer}/api/v1/authorize?response_type=code&client_id&redirect_uri={APP_URL}/api/auth/world/callback
         &scope=openid&state&nonce&code_challenge&code_challenge_method=S256
GET /api/auth/world/callback?code&state
  state must equal cookie ; POST {issuer}/api/v1/token (client_secret_basic, code, code_verifier, redirect_uri)
  verifyIdToken(id_token, {expectedNonce})
  first sign-in binds (iss, sub) to the seeded owner row (only if that row has iss null) ; later: must match
  session = {ownerId, iss, sub} ; 302 /owner
```

### 14.2 Approval step-up

```
POST /api/approve/{tipId}/start
  require owner session ; hold pending and not expired
  payload = canonical({tipId, packageKey, payee, amount, action:"release", text_version:"v1", owner_sub_hash})
  nonce = base64url(sha256(canonical_json(payload) || APPROVE_SALT)) ; new state, code_verifier
  insert approvals(method 'world', status 'pending', started_at now())
  return {url: authorize?...&max_age=0&prompt=login&acr_values=https://world.org/oidc/acr/orb-v3&nonce&state&PKCE}
GET /api/approve/callback?code&state  (or ?error=access_denied)
  find pending approval by state                    -> else 400 UNKNOWN_STATE
  error param -> failed CANCELLED
  exchange ; verifyIdToken(..., {expectedNonce: row.nonce})
  (iss, sub) == owner                               -> else WRONG_HUMAN
  auth_time >= row.started_at                       -> else STALE_AUTH
  approved ; recorder release(tipId, keccak256(nonce)) ; holds released
  credit outcome 'held' -> 'paid', tx_hash = release tx, reasons keep the hold reason and append APPROVED
  (denied or expired: outcome stays 'held', DENIED or EXPIRED appended, refund tx recorded)
  302 /approve/{tipId}
POST /api/approve/{tipId}/deny
  require owner session ; recorder refund(tipId) ; holds denied ; DENIED
```
Before E11 (`method 'session'`): `POST /api/approve/{tipId}/start` with an owner session releases
directly with the same outcome change, message `APPROVED_SESSION`. With `WORLD_REQUIRED=true` this path returns 403.

Both callbacks registered on the same hostname so the sector and `sub` are identical.

### 14.3 `verifyIdToken(idToken, {expectedNonce?})`

Checks, each with its own failure code: `SIG` (JWKS), `ISS` (== `WORLD_ISSUER`), `AUD` (== client id),
`EXP` (now < exp, 30 s skew), `NONCE` (when expected), `ACR` (== `https://world.org/oidc/acr/orb-v3`),
`AMR` (contains `pop`). Returns `{iss, sub, auth_time, acr, amr}`.

### 14.4 CLI login via device grant (P1)

`endcredits login` → `POST /api/agent/device/start` → `{issuer}/api/v1/device_authorization` →
prints `user_code` and a QR of `verification_uri` in the terminal → polls
`/api/agent/device/poll` (`authorization_pending` → wait; `slow_down` → +5 s; `access_denied` /
`expired_token` → stop with message) → on success `verifyIdToken` (no nonce), the `(iss, sub)` must be
an owner → new `agent_keys` row `bound_via 'device_grant'` → key written to `~/.endcredits/config.json`.

## 15. MultiBaas (`lib/multibaas/`)

- Deploy: `contracts/script/Deploy.s.sol` through the MultiBaas Forge plugin (**CONFIRM** install
  command, how it signs: MultiBaas signer or Foundry broadcast from `zexo-main` with
  `--password-file ~/.config/dominion/testnet-keystore.pass`). Label `endcredits_escrow`, alias
  `escrow`.
- Link Base Sepolia USDC with the ERC-20 ABI, label `usdc` (**CONFIRM**).
- Event queries (saved, **CONFIRM** the query definition format and the results endpoint):

| Query | Events | Output |
|---|---|---|
| `paid_totals` | `usdc.Transfer` where `from` = payer | sum `value`, count |
| `held_status` | `Held`, `Released`, `Refunded` | counts and sums by status |
| `reserved_by_package` | `Reserved` minus `Claimed` grouped by `packageKey` | amount, distinct `sessionId` count |
| `sessions` | `SessionSettled` | per session totals |
| `recent` | all escrow events | last 50 |

  Package names come from our DB by `package_key`; amounts and counts come only from MultiBaas.
- Webhook: subscribe to `Held` (and `Released`, `Refunded` for the dashboard's recent list). Handler
  checks the signature (**CONFIRM** header and scheme) with `MULTIBAAS_WEBHOOK_SECRET`, de-duplicates
  on the event id in `webhook_events`, inserts a `notifications` row for the owner of the payer.
  P2: Telegram message with the approve link.

## 16. Contract (`contracts/src/EndCreditsEscrow.sol`)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

contract EndCreditsEscrow {
    using SafeERC20 for IERC20;

    enum TipStatus { None, Pending, Released, Refunded }
    struct Tip { address payer; address payee; bytes32 packageKey; uint128 amount; uint64 expiresAt; TipStatus status; }
    struct Claim { address payee; uint64 changedAt; bool changed; }

    IERC20  public immutable usdc;
    address public immutable recorder;
    uint64  public immutable changeDelay;              // e.g. 3 days; 0 allowed only in tests
    uint64  public constant MIN_TTL = 60;
    uint64  public constant MAX_TTL = 7 days;

    mapping(bytes32 => Tip)     public tips;           // tipId => tip
    mapping(bytes32 => uint256) public reserved;       // packageKey => amount
    mapping(bytes32 => Claim)   public claims;         // packageKey => claim
    uint256 public totalPending;
    uint256 public totalReserved;

    event Held(bytes32 indexed tipId, bytes32 indexed packageKey, address indexed payer,
               address payee, uint256 amount, uint8 reason, uint64 expiresAt);
    event Released(bytes32 indexed tipId, address indexed payee, uint256 amount, bytes32 approvalRef);
    event Refunded(bytes32 indexed tipId, address indexed payer, uint256 amount, bool expired);
    event Reserved(bytes32 indexed packageKey, address indexed payer, uint256 amount, bytes32 indexed sessionId);
    event ClaimSet(bytes32 indexed packageKey, address indexed payee, address previous, bytes32 evidence);
    event Claimed(bytes32 indexed packageKey, address indexed payee, uint256 amount);
    event SessionSettled(bytes32 indexed sessionId, bytes32 indexed ownerHash, uint256 budget,
                         uint256 paid, uint256 held, uint256 reservedAmount, uint256 refused, bytes32 manifestHash);

    error NotRecorder();
    error ZeroAmount();
    error ZeroPayee();
    error TipExists(bytes32 tipId);
    error NotPending(bytes32 tipId);
    error TipExpired(bytes32 tipId);
    error NotExpired(bytes32 tipId);
    error TtlOutOfRange(uint64 ttl);
    error NoClaim(bytes32 packageKey);
    error NothingReserved(bytes32 packageKey);
    error ClaimCoolingDown(bytes32 packageKey, uint64 until);

    constructor(IERC20 usdc_, address recorder_, uint64 changeDelay_);

    function hold(bytes32 tipId, bytes32 packageKey, address payee, uint256 amount, uint8 reason, uint64 ttl) external;
    // payer = msg.sender ; pulls amount via safeTransferFrom ; payee fixed for this tip
    function release(bytes32 tipId, bytes32 approvalRef) external;   // onlyRecorder, Pending, now < expiresAt
    function refund(bytes32 tipId) external;                         // Pending ; recorder any time, anyone once now >= expiresAt
    function reserve(bytes32 packageKey, uint256 amount, bytes32 sessionId) external;   // pulls from msg.sender
    function setClaim(bytes32 packageKey, address payee, bytes32 evidence) external;    // onlyRecorder ; a change sets changed + changedAt
    function claim(bytes32 packageKey) external;                     // anyone ; to claims[packageKey].payee ; blocked for changeDelay after a change
    function recordSession(bytes32 sessionId, bytes32 ownerHash, uint256 budget, uint256 paid,
                           uint256 held, uint256 reservedAmount, uint256 refused, bytes32 manifestHash) external;  // onlyRecorder
}
```

`packageKey = keccak256(abi.encodePacked("npm:", name))`. `tipId = keccak256(abi.encode(sessionKey,
packageKey))`. State changes before transfers (checks-effects-interactions). The first `setClaim` for
a package is not a change and does not start the delay; each later one with a different payee does.

Note on the interface: `release` takes `approvalRef` (the hash of the World approval nonce) and
`reserve` takes `sessionId`, both beyond the minimal spec, so the dashboard can count sessions and an
auditor can tie a release to its approval.

### 16.1 Tests (`forge test -vv`), each failing when its guard is removed

| Test | Guard it pins |
|---|---|
| `test_hold_pullsFundsAndEmits` | happy path, balances and event fields |
| `test_hold_revertsOnZeroAmount` | `ZeroAmount` |
| `test_hold_revertsOnZeroPayee` | `ZeroPayee` |
| `test_hold_revertsOnDuplicateTip` | `TipExists` |
| `test_hold_revertsOnTtlOutOfRange` (below MIN, above MAX) | `TtlOutOfRange` |
| `test_release_paysFixedPayee` | release goes to the payee stored at hold, not the caller or any argument |
| `test_release_revertsForNonRecorder` | `NotRecorder` |
| `test_release_revertsAfterExpiry` | `TipExpired` |
| `test_release_revertsTwice` / `test_release_revertsAfterRefund` | `NotPending` |
| `test_refund_byRecorderBeforeExpiry` | recorder path |
| `test_refund_revertsForStrangerBeforeExpiry` | `NotExpired` |
| `test_refund_byAnyoneAfterExpiry` | permissionless expiry, `expired == true`, funds to payer |
| `test_refund_revertsTwice` | `NotPending` |
| `test_reserve_accumulatesAndEmits` | reserve bookkeeping, `sessionId` in event |
| `test_reserve_revertsOnZeroAmount` | `ZeroAmount` |
| `test_setClaim_revertsForNonRecorder` | `NotRecorder` |
| `test_setClaim_revertsOnZeroPayee` | `ZeroPayee` |
| `test_claim_paysClaimedPayeeAndZeroes` | claim pays the stored payee, reserve becomes 0 |
| `test_claim_revertsWithoutClaim` | `NoClaim` |
| `test_claim_revertsWhenNothingReserved` | `NothingReserved` |
| `test_claim_firstSetClaimHasNoDelay` | first claim immediate |
| `test_claim_revertsDuringCoolingAfterChange` | `ClaimCoolingDown` |
| `test_claim_succeedsAfterCooling` | delay ends |
| `test_recordSession_revertsForNonRecorder` | `NotRecorder` |
| `testFuzz_holdRefund_returnsExactAmount` | amounts |
| `invariant_balanceEqualsPendingPlusReserved` | `usdc.balanceOf(escrow) == totalPending + totalReserved` across random hold / release / refund / reserve / claim |

Each guard test asserts the specific custom error selector (`vm.expectRevert(abi.encodeWithSelector(…))`),
never a bare `expectRevert()`, so a different revert cannot satisfy it. Mutation check at T6.2:
delete each guard in turn, run the suite, confirm exactly the named test fails.

Deploy on Base Sepolia (MultiBaas plugin), verify on Sourcify, confirm `exact_match` (not the job id).

## 17. Test plan (app)

| Area | Tests | Must fail when |
|---|---|---|
| specifier / path parsing | relative, builtin, `node:`, alias, scoped, deep path, pnpm path, invalid name | the corresponding skip or split is removed |
| attribution | not-installed dropped; transitive import dropped; caps per signal; dep diff | the installed check or a cap is removed |
| split | property tests §7.1; all-capped leftover; dust | the cap loop or dust floor is removed |
| payee resolve | order (claim over drips over tea); invalid address; tea quorum > 1 → none | order changed |
| change detection | changed within 30 days → changed; older → not | window check removed |
| decision matrix | one test per step in §8, plus order: sanctioned + changed → refused (not held); screen error + clean-looking → held; reserved never screened for payment | order changed; assert message code |
| lookalike | 4+4 match different address → refused; same address → no match | the comparison is removed |
| Intercepta | timeout → held; mapping 84532 → 8453; cache hit skips the network (spy on fetch) | timeout handling removed |
| x402 server | held / refused credit → 409; stale screen → 409 | the outcome check is removed |
| x402 client | refuse → signer never called; challenge payTo swapped → PAYTO_MISMATCH, signer never called | the pre-sign check is removed |
| hook `record` | malformed stdin → exit 0, nothing on stdout; runs < 50 ms on a 1 MB Write | a throw escapes |
| settle upload | revoked key → 401; idempotent re-upload | auth check removed |
| claim | no push permission → NO_PERMISSION; FUNDING mismatch → no `setClaim`; claim payee screened critical → refused | each check removed |
| webhook | bad signature → 401; duplicate event id → one notification | signature or de-dup removed |
| World (E11) | `verifyIdToken` one per check; callback: cancelled, stale `auth_time`, wrong nonce, other `sub` | each guard removed |
| e2e smoke | `/`, `/dashboard`, `/history`, `/credits/<seeded id>` return 200 on the deployed URL | n/a |

Live tests (Intercepta, MultiBaas, x402 on Base Sepolia) are tagged `live` and skipped without keys.
Mocks exist only inside tests.

## 18. Seed and demo state

`scripts/seed.ts` (idempotent):
- Owner `Faisal (demo owner)`, payer `zexo-main`, budget 2.00, cap 0.25, daily limit 20, TTL 86400,
  `settle_mode on_open`.
- One agent key `bound_via dev` written to `~/.endcredits/config.json` on his laptop.
- Payer `approve(escrow, 1000e6)`.

`scripts/publish-fixtures.sh` (run once, Friday, under the npm org `endcredits-demo`, **CONFIRM** name):

| Package | Repo | FUNDING.json | Purpose |
|---|---|---|---|
| `@endcredits-demo/moved-payout` | `zexoverz/endcredits-fixture-moved-payout` | address A (a fresh `cast wallet new`), then changed to B after one warm-up session observed A | held, `ADDRESS_CHANGED` |
| `@endcredits-demo/left-padder-pro` | `zexoverz/endcredits-fixture-left-padder-pro` | `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` (OFAC SDN) | refused, Intercepta trait |
| `@endcredits-demo/unclaimed-utils` | `zexoverz/endcredits-fixture-unclaimed-utils` | none | reserved, then claimed live in the judged demo |
| `@endcredits-demo/unclaimed-rehearsal-1..3`, `unclaimed-finalist` | one repo each, same pattern | none | a claim is one-shot (after the merge the package is payable), so every rehearsal and the finalist run get their own |

Each fixture README's first line: `Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real
library.` Each exports one tiny function so the session imports it.

`scripts/probe-payees.ts`: for the demo app's real dependencies, resolve payee and screen; print the
table. Any real package that comes back held or refused is removed from the demo app before the
recording (SPEC §7.4). Output kept in `docs/intercepta-probe.md`.

Demo repo `zexoverz/endcredits-demo-reports` (Next.js + Tailwind, `zod`, `date-fns`,
`@tanstack/react-query`, `react-day-picker`, the three fixtures). Warm-up session Friday (observes A
for `moved-payout`), then change `moved-payout`'s `FUNDING.json` to B, then the recorded session
10-15 min before judging: "Add a date range filter to /reports", instructed to use the fixture
helpers.

Also seeded into history before judging, from real runs earlier in the weekend: one hold that expired
(TTL 60 s) and was refunded by the expirer, and one denied hold.

## 19. README skeleton

1. One sentence (SPEC §0).
2. Why: three sourced lines (HBS value gap, Tailwind comment, 2.1% payable).
3. Not a paywall: two sentences.
4. How it works: hook → attribution → split → payee → screen → pay / hold / reserve → roll; the roll
   screenshot.
5. **Intercepta**: files that call the API (`lib/intercepta/client.ts`, `worker/settler.ts`,
   `lib/decision/matrix.ts`), the decision matrix, the testnet-to-mainnet mapping, "real maintainer
   mainnet addresses are what we screen", 3-5 lines of API feedback.
6. **Curvegrid**: one-sentence summary; how MultiBaas is used (Forge plugin deploy, event queries as
   the dashboard backend, `Held` webhook); team and handles (Faisal, `zexoverz`); setup and testing
   (`pnpm i`, env, `forge test -vv`, `pnpm test`, seed, `endcredits init`); MultiBaas experience.
7. **World ID for Agents**: approval step-up (params, checks), denied paths, CLI device grant (P1),
   debrief (time to first success, friction, missing docs, one improvement).
8. Attribution weights and caps, and that they are ours.
9. Honest limits (SPEC §14).
10. Measurement: `scripts/measure-funding.py`, date, method, results table.
11. Deployed: app URL, `EndCreditsEscrow` (Sourcify link), payer and recorder addresses, MultiBaas
    deployment.
12. Demo fixtures: the three `@endcredits-demo` packages and why they exist.
13. AI usage: pointer to `AI_USAGE.md` and `docs/plan/`.
