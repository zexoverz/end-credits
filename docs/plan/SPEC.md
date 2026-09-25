# End Credits: spec

ETHGlobal Tokyo, 25-27 Sep 2026, Toranomon Hills Forum. Solo builder: Faisal (`zexoverz`).
Submission deadline **Sunday 27 Sep, 09:00 JST**. Written 25 Sep 2026, after hacking started, as the
plan for the build. It goes into the repo as `docs/plan/` at the first commit (see §15), minus the
prize requirements in §3.

Companion files: `DESIGN.md` (exact schema, routes, flows, rules, messages, tests), `TICKETS.md`
(epics, stories, tickets, cut order) and `AGENTS.md` at the repo root. `storyboard.html`
in this folder is the visual mockup of the demo; where it and this spec differ, this spec wins (see
§12.3).

Anything marked **CONFIRM** is a library or API detail not yet checked against current docs. It is
resolved at kickoff and written into `docs/plan/decisions.md`.

---

## 0. One line

> **End Credits: your AI agent pays every open-source project it used, and never pays the scammers
> pretending to be them.**

Everything below serves that sentence. If a feature does not make it truer or easier to show, it is
cut.

## 1. The problem, with sources

Open source carries most of the software economy and gets almost none of the money. AI coding agents
now use it more than people do, and they read the docs, the types and the source without ever
reaching the pages where maintainers ask for support.

| Fact | Source |
|---|---|
| Demand-side value of open source software: $8.8T. Supply-side (cost to recreate): $4.15B | Hoffmann, Nagle, Zhou, HBS Working Paper 24-038 (2024) |
| 60% of maintainers are unpaid | Tidelift, 2024 |
| "75% of the people on our engineering team lost their jobs … because of the brutal impact AI has had on our business" | Adam Wathan, GitHub comment, 7 Jan 2026, tailwindlabs/tailwindcss.com#2388 |
| "Traffic to our docs is down about 40% from early 2023 despite Tailwind being more popular than ever"; docs are "the only way people find out about our commercial products" | same comment |
| "75% of all new code at Google is now AI-generated" | Google, Cloud Next, 22 Apr 2026 |
| One AI crawler downloaded 73 TB from Read the Docs in May 2024, costing over $5,000 | Read the Docs, 25 Jul 2024 |
| Bots are 65% of Wikimedia's most expensive traffic | Wikimedia Foundation, 1 Apr 2025 |
| Stack Overflow new questions per month: 207,172 (Mar 2014) → 1,123 (Aug 2026) | Stack Exchange API |

**People and companies already want to pay. They lack a way to allocate by use.**

| Fact | Source |
|---|---|
| Open Source Pledge: $7,408,535 paid since Oct 2024; members pledge $2,000+ per developer per year | Open Source Pledge |
| GitHub Sponsors: $100M+ paid since 2019 | GitHub Sponsors |
| $12.5M to Alpha-Omega / OpenSSF from Anthropic, AWS, GitHub, Google, DeepMind, Microsoft, OpenAI | Alpha-Omega / OpenSSF, 17 Mar 2026 |
| Anthropic gave $1.5M to the Python Software Foundation | PSF, Jan 2026 |
| Sentry pays $750k a year to open source, $375k of it via thanks.dev | Sentry |

A company pledging $2,000 per developer per year has about $8 per developer per working day (250
days) to give, and no record of which projects that developer's agent actually leaned on. End Credits
is that record, and it pays from it.

**Payment destinations are an attack target.**

| Fact | Source |
|---|---|
| tea.xyz usage rewards produced 150,000+ spam npm packages whose `tea.yaml` pointed at farmer wallets | Amazon Inspector, 13 Nov 2025 |
| The Sept 2025 npm compromise (chalk, debug, ~2B weekly downloads) shipped a clipper that swapped payment destinations for the most similar attacker address | Sept 2025 npm compromise write-ups (link the one we cite in the README) |
| No documented case yet of a FUNDING file being hijacked | as of 25 Sep 2026 |

We pitch FUNDING-file hijack as a **risk class**, not as something that has happened. An agent that
pays unattended, from addresses it reads out of files that anyone with repo write access (or a
stolen token) can change, needs a screen before it signs.

**Against, and the pitch must answer these:**
- Tipping has failed before: Coil shut down 15 Mar 2023; Flattr closed Jan 2024; Brave Auto-Contribute
  was removed in 1.75 (Nov 2024); only 14.1% of GitHub Sponsors profiles ever get a sponsor. Our
  answer: all of those relied on humans choosing to tip, one page at a time. Here the owner sets a
  budget once and the agent allocates it by use, every session.
- Almost no package can be paid directly (§6.1: 2.1% of the top 1,000). Our answer: the money is
  reserved under the package and the maintainer claims it in about a minute (§8).
- "Is this a paywall?" No. Nothing changes for anyone who does not turn it on. Packages stay free.
  The payer is the agent's owner who opted in and set the budget.

## 2. Prior art: nothing identical

| Project | What it does | What it lacks |
|---|---|---|
| OpenGrant (github.com/qvkare/opengrant, Feb-Mar 2026) | a Claude agent pays APIs over x402; a separate human-started "stack fund" from an uploaded `package.json` | no screening, no per-session attribution |
| Keryx | an agent pays the writers it cited, over x402 | writers, not code; no payee screening |
| Xpack (HackMoney 2026) | install paywall for packages | a paywall, human payer |
| SkillsBay, Clembot Doorman (ETHOnline 2026) | agent payments for skills / access | not dependency funding |
| Drips, tea, thanks.dev | fund dependencies from a manifest or a company account | not per agent session, no screening; tea's model was farmed (§1) |
| Cloudflare Wallets (Aug 2026) | agent spend caps and anomaly review | generic, knows nothing about packages or maintainers |
| 402coffee | x402 tip jars | a human tips one jar at a time |

**The open slot:** the agent's own session is the attribution record; the owner's budget is split by
what that session used; every payee is screened before a signature exists; anything doubtful waits
for a human; anything without a wallet waits for its maintainer.

## 3. Prizes targeted (up to 3 partners; a partner with several tracks counts once)

Partners: **Intercepta, Curvegrid, World.** Classic track.

**Intercepta: Safe Agent-to-Agent Payments with x402, $1,250 / $750.**
1. A working agent payment flow, x402 preferred, testnet allowed.
2. At least one **live** Intercepta call runs before a payment is signed or accepted, and its result
   decides what happens next. Mocked or hard-coded responses do not qualify.
3. Screen **real mainnet addresses** even when paying on testnet. End Credits does this by nature:
   the payees are the real addresses maintainers published.
4. Demo: one payment goes through, one is blocked or held, reason visible.
5. Public repo; README points to the files that call the API and has 3-5 lines of API feedback.
Their outcomes are "pay, refuse, cap the amount or ask a human". End Credits has all four, plus
`reserved`, on one screen.

**Curvegrid (one slot, eligible for all three tracks; RWA does not fit).**
- "Best AI Agent Project", $1,000. The settlement agent.
- "Best Digital Asset Dashboard", $1,000. The MultiBaas-backed dashboard (§10).
Judged on idea and technical execution. Repo with contracts, tests, docs; README with (1) one-sentence
summary, (2) MultiBaas use, (3) team intro and handles, (4) setup and testing steps, (5) MultiBaas
experience. **We use MultiBaas** (free plan, supports Base Sepolia 84532 and Base 8453): deploy
`EndCreditsEscrow` through the MultiBaas Foundry Forge plugin, use its event indexing and query
language as the dashboard backend, and a webhook on `Held` events to notify the owner. Cloud Wallets
are skipped. **CONFIRM at the booth** whether one project can win both tracks.

**World: Best Use of World ID for Agents, $5,000 (classic track).** Built last, lowest priority.
Requirements (same as the Vintage reading of the prize page): integrate World ID for Agents; a
complete journey (request, user completion, validated result, the protected action); a denied,
expired or cancelled path where the action does not happen; validation in a secure backend; an
integration debrief (time to first success, friction, missing docs, the one improvement with the
greatest impact). End Credits' protected action is **releasing money an agent held**: a fresh World
ID verification bound to that exact tip. End Credits is never pitched as "human-backed benefits for AI agents".

**Finalist.** 4 min demo + 3 min Q&A: Technicality, Originality, Practicality, Usability, WOW. The WOW
is the credits roll on real data.

## 4. Product

### 4.1 Who does what

| Actor | Does | Needs |
|---|---|---|
| **Owner** (a developer or a company running coding agents) | opts in, sets the per-session budget and per-package cap, funds the payer wallet, approves held tips | an End Credits account; World ID for approvals (§9) |
| **Agent** (a Claude Code session) | works as usual; the End Credits hook records which packages it used | the hook installed with `endcredits init` |
| **Settler** (our server-side agent) | attributes, allocates, resolves payees, screens, pays, holds, reserves, records | the payer wallet key and the recorder key (testnet) |
| **Maintainer** | claims reserved money for their package | GitHub push or admin on the repo; a passkey |

**Not a paywall.** Nothing changes for anyone who does not install the hook. No package is gated,
nobody is asked to pay to install anything, and the money flows one way: from an owner who chose to
give, to maintainers.

### 4.2 The session, end to end

1. The owner runs `endcredits init` in a repo (or globally). It installs Claude Code hooks and stores
   an agent key.
2. During the session, a `PostToolUse` hook appends one line per relevant tool call to a local
   ledger (§5). It never blocks, never fails the tool, and never sends source code anywhere.
3. On `SessionEnd`, the hook attributes usage locally, uploads **package names, signal types and
   counts** (not code, not repo paths), and opens the credits page.
4. The settler allocates the owner's session budget by usage weight with a per-package cap (§5.3),
   resolves each payee (§6), screens each one with Intercepta (§7), decides (§7.3), and executes:
   - `paid` / `capped`: x402 payment in USDC straight to the maintainer's address (§8.1).
   - `held`: USDC moves into `EndCreditsEscrow` until the owner approves with a fresh World ID
     verification; deny or expiry refunds the owner (§9).
   - `refused`: nothing is sent; that share stays with the owner.
   - `reserved`: USDC moves into the escrow under the package key until the maintainer claims (§8.2).
5. The credits roll (§12) shows every package with its badge and reason. Every on-chain step emits an
   event that MultiBaas indexes (§10).

Settle mode: `auto` (at session end) or `on_open` (when the credits page is opened and the owner
presses **Roll credits**). The demo uses `on_open`, so judges watch the live screening and payments.

### 4.3 Outcomes (the badges)

| Badge | Meaning | Money |
|---|---|---|
| `paid` | clean payee, paid in full | x402 transfer to the maintainer; Basescan link |
| `capped` | clean payee, share cut to the per-package cap | x402 transfer of the capped amount; the excess went to other packages |
| `held` | a doubt: funding address changed recently, medium risk, or screening unavailable | in escrow; released on World-approved owner decision; refunded on deny or expiry |
| `refused` | Intercepta high risk: sanctioned, known scammer, phishing, lookalike token, lookalike address, or a spam payout pattern | not sent; stays with the owner |
| `reserved` | the package lists no wallet | in escrow under the package key until the maintainer claims |

## 5. Attribution

### 5.1 Signals (captured by the hook)

| Signal | Captured from | Weight | Cap per package per session |
|---|---|---|---|
| `dep_added` | `package.json` dependency diff between `SessionStart` and `SessionEnd`; or a Bash `npm/pnpm/yarn/bun add` | 5 | once |
| `import` | `Write`/`Edit`/`MultiEdit` content with `import … from 'x'`, `import 'x'`, `require('x')`, `import('x')`, `export … from 'x'` | 3 per distinct file | 5 files |
| `docs` | `WebFetch` URL whose host or path maps to an installed package (npm `homepage`, repo URL, `npmjs.com/package/x`) | 2 per distinct URL | 5 URLs |
| `read` | `Read`/`Grep`/`Glob` on a path under `node_modules/<pkg>/` | 1 per distinct file | 10 files |

Rules:
- A package counts only if it is installed in the project at settle time
  (`node_modules/<name>/package.json` exists). Hallucinated names and typos earn nothing.
- `import` and `dep_added` credit direct dependencies only. **Transitive dependencies earn nothing
  unless the agent read their files.** A farm package that pulls in 100 farm packages gets nothing
  for them.
- Node builtins, relative imports and path aliases (`@/`, `~/`) are skipped.
- Weights and caps are ours; the README says so. They exist so that a prompt-injected README telling
  the agent to read one package 1,000 times moves at most 10 points.

### 5.2 What leaves the machine

Package name, version, signal, count, and for `docs` the URL. For `read`, the path **inside** the
package (`zod/lib/types.d.ts`). Never repo paths, never file contents.

### 5.3 Split

`score(p) = Σ weight × count` after the caps above. Budget `B`, per-package cap `C`:
1. Proportional split of `B` over all scores.
2. Any package above `C` is set to `C` and marked `capped`; the rest of the budget is split again
   over the remaining packages, until nothing exceeds `C` (water-filling).
3. If every package is capped, the leftover is not spent.
4. Amounts are floored to USDC's 6 decimals. Any share under 0.01 USDC is marked `dust` and not sent.
5. The owner's daily limit applies first: `B = min(session budget, daily limit − spent today)`.

Demo defaults (match the storyboard): budget **2.00 USDC** per session, cap **0.25 USDC** per
package, daily limit 20 USDC, hold expiry 24 h.

## 6. Payee resolution

### 6.1 Measured: almost nobody can be paid directly

Measured 25 Sep 2026 on the top 1,000 npm packages by downloads (`npm-high-impact@1.13.0`); script
`fundmeasure/measure.py` (moved into the repo as `scripts/measure-funding.py`). Percentages are over
all 1,000 names; 929 were read from the registry (71 stayed rate-limited) and 928 resolved to a GitHub repository (640 distinct repos).

| Metadata | Share |
|---|---|
| Any funding metadata (npm `funding` field or any funding file) | **41.6%** |
| npm `funding` field | 27.9% |
| `.github/FUNDING.yml` | 27.2% |
| **A payable wallet address anywhere** | **2.1%** (21 packages: 17 via Drips `FUNDING.json`, 4 via `tea.yaml`) |

Examples with a wallet: `prettier`, `vitest`, `rollup`, `pnpm`, `@tanstack/react-query` (Drips
`FUNDING.json`); `zod`, `qs`, `inquirer` (`tea.yaml`). The 21 packages are 10 distinct repositories
(`vitest` alone is 9 packages).

The reading: four in ten top packages already ask for money; one in fifty can receive it from an
agent. That gap is the claim flow (§8.2).

### 6.2 Resolution order (first hit wins)

1. **Our claim**: a `ClaimSet` for the package key in `EndCreditsEscrow` (set after a merged
   `FUNDING.json`, §8.2).
2. **Drips `FUNDING.json`** at the repo root on the default branch: `drips.ethereum.ownedBy`.
3. **`tea.yaml`**: `codeOwners[0]` when `quorum` is 1 (otherwise no payee).
4. **npm `funding` field** containing a `0x` address (none found in the measurement; kept for
   completeness).
5. None → `reserved`. Any GitHub Sponsors or Open Collective link found is shown on the package page
   as "also accepts".

Package → repo: the npm registry `repository` field of the installed version. P1 anti-spoof check:
the repo's `package.json` at HEAD (under `repository.directory` for monorepos) must declare the same
package name; otherwise → `reserved` with a reason.

### 6.3 Change detection

We store every `(package, address, source, observed_at)` we see. A payee is **recently changed** when
the address differs from one we observed for the same package within the last 30 days. Commit dates
are never used as evidence (they are set by the author); only our own observation times. P1 adds the
GitHub Activity API push timestamp for a file we have never observed before (**CONFIRM** coverage).

## 7. Intercepta

### 7.1 Facts (from the Vintage API research, 24 Sep; host confirmed live)

- Intercepta is the renamed Web3 Antivirus. Base `https://api.web3antivirus.io`, header `X-API-KEY`.
  Docs: `https://docs.web3antivirus.io/llms.txt` (append `.md` to reference pages for OpenAPI JSON).
  Sandbox key: 1,000 requests, from intercepta.io/ethglobal, by email.
- Address: `GET /api/public/v2/extension/account/{address}/quick-scan` and `/toxic-score` →
  `{toxicScore, traits[{name, risk, txsCount, description}]}`; no `chainId`; traits include
  `sanction_address`, `known_scammer`, `fake_phishing_transfer`, `mixer_transfers`, `blacklist`.
- Token: `GET /api/public/v2/extension/token-intelligence/token/{address}/risks?chainId=` →
  `action block|warn|info`, `riskLevel`, `detectors[{code, description}]`; lookalikes via
  `FAKE_TOKEN`, `SCAM_NAME`, `BLOCKLIST_TOKEN`.
- Signature: `POST /api/public/v2/extension/analysis/signature` supports the Permit family only, not
  `TransferWithAuthorization`.
- Simulation: `POST /api/public/v1/extension/simulation/transaction?chainId=` on 1, 56, 8453, 42161, 10.
- **No testnet chain ids anywhere.** Base Sepolia is mapped to 8453 and Base Sepolia USDC to Base USDC,
  and the screen says so under every result.
- **Impersonation / address-poisoning check: CONFIRM** whether the API has a dedicated endpoint (the
  `fake_phishing_transfer` trait is the closest known signal). Our own local lookalike check (§7.3,
  row 4) runs either way and is labelled as ours.

### 7.2 Calls per payee (cached per address for 1 h; budget 1,000)

1. `quick-scan` on the payee (its mainnet reputation).
2. Token `risks` on Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, chain 8453, once per
   session, plus a local pin: the payment token must be Base Sepolia USDC
   `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
3. Fallback: simulate `USDC.transfer(payee, amount)` from the payer on 8453.
4. Timeout 8 s. **Timeout or error → hold, never pay.**

A demo session with ~10 payees costs ~11 requests.

### 7.3 Decision matrix (the thing Intercepta judges)

First match wins.

| # | Condition | Outcome | Shown |
|---|---|---|---|
| 1 | no payee resolved | **reserved** (screened later, at claim) | "No wallet yet; the maintainer can claim it." |
| 2 | payment token is not Base Sepolia USDC, or token `action == block` | **refused** | token message or detector text |
| 3 | screen timeout or error | **held** | "Screening unavailable. Nothing is paid without a screen." |
| 4 | trait in `{sanction_address, known_scammer, blacklist, fake_phishing_transfer}`, or `toxicScore > 50`, or the payee is a lookalike of another payee we know (same first 4 and last 4 hex, different address), or spam pattern (P1: the same payee for ≥5 packages in the session, each under 1,000 weekly downloads or first published under 30 days ago) | **refused** | Intercepta's trait description, or our rule text |
| 5 | payee changed recently (§6.3) | **held** | "The funding address changed N days ago." |
| 6 | `20 ≤ toxicScore ≤ 50` or token `action == warn` | **held** | trait descriptions |
| 7 | P1: payee is a contract on Ethereum with no code on Base | **held** | "Contract on Ethereum, no code on Base." |
| 8 | otherwise | **paid**, or **capped** if the split capped it | "Paid." / "Capped at the per-package limit." |

Thresholds are ours (the `mandate` project used >50 critical, ≥20 high); the README says so. The spam
rule is deliberately narrow: legitimate maintainers share one wallet across many packages
(`ljharb`'s packages, `vitest`'s nine), which is why it requires low downloads or new packages too.

### 7.4 Demo addresses (public sources; probe before relying on them)

| Address | Category | Source |
|---|---|---|
| `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` | OFAC SDN, Lazarus Group (Ronin) | OFAC SDN.CSV, entry 27307 |
| `0x7F367cC41522cE07553e823bf3be79A889DEbe1B` | OFAC SDN | OFAC SDN.CSV, entry 29584 |
| `0x3da02e1f29bcbed185eca0d3299efd46e6e7e155` | phishing receiver (degenalgo.art) | ScamSniffer scam-database |

Plus the addresses Intercepta pins in their Discord. Do not use Tornado Cash `0x8589…DA16`; it is no
longer on the SDN list.

**Never label a real package as bad.** The held and refused rows in the demo come from our own
fixture packages under the npm scope `@endcredits-demo` (§12.3). If a real package's real payee comes
back medium or high from Intercepta during demo prep, that package is left out of the demo session,
and nothing about it is shown on stage.

## 8. Money paths

### 8.1 Direct: x402 (for `paid` and `capped`)

- Network Base Sepolia (`eip155:84532`), asset Base Sepolia USDC, `exact` scheme (EIP-3009
  `transferWithAuthorization`). The payer never pays gas; neither does the maintainer.
- Resource: `GET /api/x402/credit/:creditId` returns 402 with `payTo` = the screened payee and the
  allocated amount; after settlement it returns a signed credit receipt `{creditId, package, amount,
  payee, tx}`. The resource refuses to quote (409) for any credit whose decision is not `paid` or
  `capped`, or whose screen is older than 10 minutes.
- The settler's x402 client checks the 402 challenge **before signing**: `payTo` equals the address it
  screened, `asset` equals the pinned token, `network` is `eip155:84532`, amount ≤ allocation.
  Anything else → refuse: "The payment request names a different address than the one screened."
  This is the clipper attack from Sept 2025, answered at the moment of signing.
- The same client pays any maintainer-hosted x402 tip endpoint later (P2), the way 402coffee jars
  work.
- Facilitator and packages: **CONFIRM** at kickoff the current x402 v2 package names (`@x402/*`) and
  the public facilitator URL for Base Sepolia, via npm and docs.

### 8.2 Escrow: `held` and `reserved`

`EndCreditsEscrow` (§11) holds only doubtful and unclaimed money. Direct payments never touch it.

**Maintainer claim (must-have).** Per-package page `/npm/<name>`:

> "Agents set aside $X for `<pkg>` from N sessions. **Claim.**"

1. **Sign in with GitHub.** We check the user can push to the package's repo: `GET /repos/{o}/{r}`
   with their token, `permissions.push || permissions.admin`.
2. **Create a passkey wallet in one tap**: Coinbase Smart Wallet on Base (**CONFIRM** the SDK, the
   smart-wallet-only option and whether the address is the same on Base and Base Sepolia).
3. **One click opens a PR** adding a Drips-format `FUNDING.json`:
   `{"drips":{"ethereum":{"ownedBy":"0x…"}}}`. Fallback when the OAuth token cannot write (org
   restrictions): a prefilled GitHub "new file" link that opens the same PR in their browser.
4. **Merge = proof of control.** When the PR is merged, the server reads `FUNDING.json` from the
   default branch itself, checks it names the claimed wallet, screens that wallet with Intercepta,
   then the recorder calls `setClaim(packageKey, wallet)` and `claim(packageKey)` for every package
   key of that repo with a reserve. The maintainer pays no gas.
5. Any later change of that address: new tips go `held` (§7.3 row 5), and `claim` on the contract is
   blocked for a cooling-off period (`changeDelay`).

A maintainer who adds a `FUNDING.json` without us gets the same result: the proof is the file on the
default branch, not our PR.

**Drips format note.** Drips reads `ownedBy` as the address that owns the project on Drips. Using the
same field as a Base payee is our reuse; **CONFIRM** whether Drips accepts other network keys in
`FUNDING.json` and whether a smart wallet address is safe there. A mainnet round (§8.3) pays only
addresses with code or a clean EOA history on Base (§7.3 row 7).

### 8.3 Optional real-mainnet tip round (his decision, not planned by default)

Small real USDC on Base (8453) to packages that already list a payee, after the demo, only with
§7.3 row 7 built. Decided Saturday evening at the earliest.

## 9. World ID: the human approves held money

Built last. Before it exists, the owner approves held tips from a signed-in owner session, so
Intercepta's "ask a human" path works without World. World replaces that check with a fresh
verification.

### 9.1 Facts

- **Production IdP, confirmed by World at the booth on 25 Sep**: issuer `https://auth.world.org`, the
  normal World App. Discovery is the same shape as the sandbox: authorize `/api/v1/authorize`, token
  `/api/v1/token`, device `/api/v1/device_authorization`, JWKS `/.well-known/jwks.json`.
- Scope `openid` only. Claims: `iss sub aud exp iat jti nonce auth_time acr amr`. No userinfo, no
  refresh tokens. `profile`/`email` → `invalid_scope`; `prompt=consent` rejected.
- `response_type=code`, **PKCE `S256`** only, `response_mode=query`. Code single-use, 5 min; ID token
  5 min.
- `acr` only `https://world.org/oidc/acr/orb-v3`; `amr` `["pop"]`. **The owner must be Orb-verified.**
- Freshness: `max_age` and `prompt=login`.
- **Pairwise `sub`** per sector (the redirect hostname). One fixed production hostname from hour 0.
- Confidential client; **HTTPS callbacks only, exact match, no localhost.** Production portal URL:
  **CONFIRM** at the booth (the sandbox one is `https://sandbox.auth.world.org/portal`).
- The device grant always requires a fresh proof but ignores `nonce`, `max_age`, `prompt`, so it
  cannot bind a specific tip. Approvals therefore use the code flow with a bound `nonce`.

### 9.2 Journey

1. Owner signs in with World ID once (code flow + PKCE). The owner account is bound to `(iss, sub)`.
2. A tip is held. MultiBaas fires the `Held` webhook; the owner's page shows it (P1: a Telegram
   message with the approve link).
3. On the phone, `/approve/<tipId>` shows: package, amount, payee, the reason it was held, and the
   sentence *"Release {amount} USDC to {address} for {package}."*
4. **Approve with World ID** → authorize with `max_age=0`, `prompt=login`, `acr_values=…orb-v3`, PKCE,
   `nonce = base64url(sha256(canonical_json(payload) || salt))` where payload is `{tipId, packageKey,
   payee, amount, action: "release", text_version, owner_sub_hash}`.
5. Callback: signature via JWKS, `iss`, `aud`, `exp`, `nonce` equals the stored nonce, `(iss, sub)`
   equals the owner, `acr == orb-v3`, `amr` contains `pop`, `auth_time >= started_at`.
6. Only then the recorder calls `release(tipId, approvalRef)` with `approvalRef = keccak256(nonce)`.

### 9.3 Unsuccessful paths (demoed)

- Cancelled in the app → "Verification cancelled. Nothing was released."
- Stale session (`auth_time` before `started_at`) → "A fresh verification is required. Nothing was
  released."
- A different human → "This approval belongs to a different human."
- Deny → refund to the owner. Expiry → anyone may call `refund`; our worker does.

P1: `endcredits login` in the terminal uses the **device grant**: the owner approves in World App and
the CLI gets an agent key bound to that `(iss, sub)`. Every agent sending usage is then human-backed.

## 10. Curvegrid MultiBaas

- **Deploy** `EndCreditsEscrow` with the MultiBaas Foundry Forge plugin (**CONFIRM** the package name
  and flow), link it in MultiBaas with its ABI, and verify on Sourcify (`exact_match`) as always.
- **Link Base Sepolia USDC** in MultiBaas with the ERC-20 ABI so `Transfer` events from the payer
  wallet (the x402 payments) are indexed alongside the escrow events (**CONFIRM** linking an existing
  contract we did not deploy).
- **Event queries** are the dashboard backend: totals by outcome this weekend, top packages by amount,
  reserved balances waiting per package with session counts, held awaiting approval, released,
  refunded, claimed (**CONFIRM** the query API and aggregation support).
- **Webhook** on `Held` → `POST /api/webhooks/multibaas` → owner notification; signature checked,
  events de-duplicated by id (**CONFIRM** the signature header).
- The settlement agent is the "AI Agent Project"; the dashboard is the "Digital Asset Dashboard".

## 11. Contract: `EndCreditsEscrow` (Foundry, Base Sepolia, Sourcify-verified)

Direct payments are x402, so the contract handles only held and reserved funds. Full interface and
tests in `DESIGN.md` §8.

| Function | Who | Does |
|---|---|---|
| `hold(tipId, packageKey, payee, amount, reason, ttl)` | the payer | pulls USDC into escrow for one tip; payee fixed forever |
| `release(tipId, approvalRef)` | recorder, after the owner's World-verified approval | sends the tip to its fixed payee |
| `refund(tipId)` | recorder any time while pending (deny); **anyone** after expiry | returns the tip to its payer |
| `reserve(packageKey, amount, sessionId)` | the payer | adds to the package's reserve |
| `setClaim(packageKey, payee, evidence)` | recorder, only after the merged `FUNDING.json` is verified | sets or changes the package's payee; a change starts `changeDelay` |
| `claim(packageKey)` | anyone | sends the whole reserve to the claimed payee |
| `recordSession(sessionId, ownerHash, totals, manifestHash)` | recorder | one event per settled session, for the dashboard |

Every function emits an event so MultiBaas indexes everything. Invariant: the escrow's USDC balance
equals the sum of pending holds plus the sum of reserves.

## 12. Credits roll, pages, demo

### 12.1 The roll

Black screen, "This session was made possible by…", then the packages scroll in film-credit style
with roles: **Starring** (top 3 by share), **Featuring** (imports), **Research** (docs), **Special
thanks** (reads only). Each row: name, main signal and count, amount, badge. Badges resolve one by
one as the settler finishes each payee; each has its reason line and, when paid, a Basescan link.
Footer: *"End Credits is opt-in for whoever runs the agent. Packages stay free for everyone."*

### 12.2 Other pages

`/dashboard` (MultiBaas), `/npm/<name>` (package page and claim), `/approve/<tipId>` (phone),
`/owner` (budget, cap, payer wallet, keys, pending holds), `/history` (every decision with reasons).

### 12.3 Demo data (details in `DESIGN.md` §12)

- A real Claude Code session in a real repo we create, recorded 10-15 min before the demo: "add a date
  range filter to /reports" in a small Next.js app using `zod`, `date-fns`, `@tanstack/react-query`,
  `tailwindcss`, `react-day-picker`, and three fixture packages we publish.
- Expected outcomes from the 25 Sep measurement (re-check at prep): `zod` paid or capped (`tea.yaml`),
  `@tanstack/react-query` paid (Drips), `tailwindcss` and `date-fns` reserved (FUNDING.yml only, no
  wallet).
- Fixtures (fictional, ours, public, labelled "demo fixture" in their READMEs):
  `@endcredits-demo/moved-payout` (its `FUNDING.json` address changed during the hackathon → held),
  `@endcredits-demo/left-padder-pro` (its `FUNDING.json` names an OFAC SDN address → refused),
  `@endcredits-demo/unclaimed-utils` (no wallet → reserved; the live claim is done on this one, from
  a repo he controls).
- Held and refused rows are always `@endcredits-demo/*` fixtures, never a real package.

## 13. Architecture

| Part | Choice | Why |
|---|---|---|
| App | Next.js (App Router), TypeScript | web app; server routes hold the OIDC client and keys |
| Settler | Node worker in the same repo, second Railway service (`pnpm worker`) | payments and chain txs outside request timeouts |
| CLI and hooks | `cli/` TypeScript, bundled to one file, run as `endcredits` | hooks must start fast and never fail the tool |
| Hosting | Railway, **one fixed `*.up.railway.app` HTTPS domain** | HTTPS callbacks from hour 0 (World, GitHub) |
| DB | Postgres on Railway, Drizzle migrations | |
| OIDC | `openid-client` (panva), confidential client, PKCE | |
| GitHub | OAuth App (**CONFIRM** scope for PR creation: `public_repo`), Octokit | maintainer sign-in and PR |
| Passkey wallet | Coinbase Smart Wallet SDK on Base (**CONFIRM**) | one-tap wallet, no seed phrase |
| Payments | x402 v2 packages, Base Sepolia (**CONFIRM**) | |
| Chain | viem; Foundry; MultiBaas Forge plugin | |
| Indexing | MultiBaas event queries and webhooks | Curvegrid |
| Screening | Intercepta REST | |

Keys: `PAYER` (the owner's testnet payer wallet, server-held for the demo; stated in the README as a
demo simplification) and `RECORDER` (the server's role key). Both testnet, from the `dev-wallet`
skill.

## 14. Honest limits (README)

1. Attribution is a proxy. What the agent read and wrote is evidence of use, not a measure of value.
2. Transitive dependencies earn nothing unless the agent read them. Deep infrastructure is
   under-credited; this is a deliberate trade against farming.
3. The payee is whatever the repo publishes. A compromised repo can change it; we hold on change and
   screen before signing, but cannot prove who wrote the file beyond "it is on the default branch".
4. `tea.yaml` addresses come from a scheme that was farmed; they are screened like every other.
5. In the demo the payer key is server-held and everything is on Base Sepolia; the payees' real
   mainnet addresses are what is screened.
6. The claim needs a merged PR; orgs that restrict OAuth apps use the "new file" link instead.

## 15. ETHGlobal rules that bind this build

- All project-specific code, designs and assets made after the start (25 Sep); only public libraries
  and starter kits, disclosed. The storyboard and this plan were made on 25 Sep, after the start.
- AI tools are allowed but must be documented per file or part; spec-driven plans and prompts must be
  in the repo; a project built "entirely" by AI can lose eligibility. `docs/plan/` holds `SPEC.md`,
  `DESIGN.md`, `TICKETS.md`, `storyboard.html`, and `AGENTS.md` sits at the root. `AI_USAGE.md` is updated after
  every ticket with the files the agent wrote and what he reviewed. He reviews and drives every
  ticket.
- Real commit history: small commits, no single large final-day commit.
- Classic track. Up to 3 partner prizes: **Intercepta, Curvegrid, World**.
- The fundmeasure script predates the repo by hours; it is project work made after the start and goes
  in as `scripts/measure-funding.py` with its date.

## 16. Before building (Friday)

1. Intercepta key: request (intercepta.io/ethglobal) if not already in `~/.config/dominion/intercepta-key`.
2. Railway project `endcredits`, one web service + one worker service, fixed domain.
3. World: Orb-verified in World App (done or at the venue); register the production OIDC client with
   `https://<domain>/api/auth/world/callback` and `https://<domain>/api/approve/callback`.
4. GitHub OAuth App, callback on the same domain.
5. MultiBaas: free-plan deployment on Base Sepolia, API key, note the deployment URL.
6. npm: create the `endcredits-demo` org (free, public packages) (**CONFIRM** the name is free).
7. Wallets (dev-wallet skill): `zexo-main` as payer (Base Sepolia ETH + USDC), `zexo-secondary` as
   recorder (Base Sepolia ETH).

## 17. Open questions

- Claude Code hook input fields for `PostToolUse`, `SessionStart`, `SessionEnd` (`session_id`,
  `transcript_path`, `cwd`, `tool_name`, `tool_input`, `reason`): **CONFIRM** against current docs.
- Does Intercepta have an impersonation or address-poisoning endpoint? Do the SDN addresses above come
  back `sanction_address`? (probe with the key)
- x402 v2 package names and the Base Sepolia facilitator URL.
- MultiBaas: Forge plugin name, linking USDC, event query aggregation, webhook signature header,
  free-plan limits, one project eligible for both tracks?
- Coinbase Smart Wallet: SDK and whether the address is the same on Base and Base Sepolia.
- Drips `FUNDING.json` network keys other than `ethereum`.
- World production portal URL; does the step-up redirect return cleanly to the phone's browser after
  World App?
- Mainnet tip round: yes or no (his call, Saturday evening at the earliest).
