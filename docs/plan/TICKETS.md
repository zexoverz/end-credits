# End Credits: epics, stories, tickets

Plan written 25 Sep 2026, after hacking started. Each ticket is one small PR-sized unit: one agent
run, several small commits, a check that fails before and passes after. Estimates are for agent
execution with him reviewing each diff.

**Priority.** P0 = carries a prize requirement or the must-have claim; ship before anything else.
P1 = raises a ceiling. P2 = only if ahead.

**Cut order when behind (first to go):** P2 (Telegram notify, Context7 docs signal, maintainer x402
endpoints, PyPI) → mainnet tip round → spam-pattern rule → no-code-on-Base rule → package→repo
anti-spoof check → CLI device-grant login (T11.5) → Activity API change signal → World step-up
(E11 whole; held tips are then approved from the owner session) → dashboard polish beyond the five
cards and one table → roll animation polish.

**Never cut:** live Intercepta decision with `paid`, `held` and `refused` visible with reasons; the
x402 payment with its pre-sign challenge check; `EndCreditsEscrow` with its guard tests, deployed
through MultiBaas and Sourcify-verified; `reserved` plus the maintainer claim end to end; the credits
roll on a real session; the MultiBaas-backed dashboard; the README sponsor sections; the video.

**Every ticket's definition of done:** check command passes; `AI_USAGE.md` updated with the files
this ticket's agent wrote and what he reviewed; small plain commit messages, SSH-signed, no
attribution trailers; no secret in the diff.

---

## E0: Foundation (P0)

**Story.** As the builder, I have a deployed HTTPS app, a worker and a database from hour one, so
GitHub, MultiBaas and World callbacks all use one fixed hostname.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T0.1 | `git init`, pnpm workspace: Next.js App Router + TypeScript + Tailwind, `cli/`, `worker/`, `contracts/`; `docs/plan/` with SPEC (no §3 estimates), DESIGN, TICKETS, AGENTS; `AI_USAGE.md`; `AGENTS.md` at root; `scripts/measure-funding.py` with its date | app boots; plan files in the first commit | `pnpm build` | 0.5h |
| T0.2 | Railway project `endcredits`: web service with a fixed `*.up.railway.app` domain, worker service from the same repo (`pnpm worker`); `GET /api/health` returns commit sha | deployed URL returns sha | `curl -s https://<domain>/api/health` | 0.5h |
| T0.3 | Postgres + Drizzle schema for all tables in DESIGN §3; migration on deploy | tables exist | `pnpm drizzle-kit migrate` then `psql -c '\dt'` | 1h |
| T0.4 | Env contract (DESIGN §2); boot fails with `Missing required env: <NAME>` for a missing P0 var | missing var → named error | unit test | 0.5h |
| T0.5 | `lib/messages.ts` with every code in DESIGN §11 and a `msg(code, vars)` formatter that throws on a missing var | all strings in one place | unit test | 0.5h |

## E1: CLI, hooks, attribution (P0)

**Story.** As an owner, I install End Credits once and every Claude Code session produces an
attribution of the packages it actually used, without my code leaving the machine.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T1.1 | **CONFIRM** Claude Code hook events, matcher syntax and stdin fields against current docs; record in `decisions.md` | fields pinned | n/a | 0.25h |
| T1.2 | `endcredits init` merges hooks into `.claude/settings.json` (or `--global`), never replacing existing hooks; `endcredits key <token>` writes config mode 600 | existing hooks preserved | unit test on a settings fixture with prior hooks | 1h |
| T1.3 | `endcredits start` (dep snapshot) and `endcredits record` (DESIGN §4.3 table), always exit 0, no stdout, < 50 ms | ledger lines correct per tool | unit tests per tool + malformed stdin + timing test | 1.5h |
| T1.4 | `lib/attribution/specifier.ts`: specifier → package, path → package (incl. pnpm), npm name validation | DESIGN §17 parsing rows | `pnpm test attribution` | 1h |
| T1.5 | `lib/attribution/score.ts`: installed set, direct-only for import/dep, per-signal caps, docs URL mapping, roles | not-installed and transitive imports dropped; caps hold | `pnpm test attribution` | 2h |
| T1.6 | `endcredits settle`: attribute, upload (DESIGN §6.1), print and open the roll URL, keep the ledger on failure; `endcredits attribute --dry-run` | a real session in a scratch repo produces a sensible table | manual on a real Claude Code session + unit test on upload failure | 1.5h |
| T1.7 | `POST /api/sessions` with agent-key auth, validation, idempotency; `GET /api/sessions/:id` | revoked key 401; re-upload same id | integration test | 1h |

## E2: Registry and payee resolution (P0)

**Story.** As the settler, I know for every package where its money should go, and when that changed.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T2.1 | `lib/registry/npm.ts`: registry doc, repo from `repository`, homepage, funding links, `time.created`, weekly downloads; 1 h cache | fields for `zod`, `@tanstack/react-query`, `tailwindcss` | integration test (live, network) | 1h |
| T2.2 | `lib/payee/parse.ts`: Drips `FUNDING.json` (`drips.ethereum.ownedBy`), `tea.yaml` (`codeOwners`, `quorum`), npm funding address; checksum; invalid → none. **CONFIRM** tea.yaml fields on `colinhacks/zod` | parsers on real files | unit tests with real file fixtures | 1h |
| T2.3 | `lib/payee/resolve.ts`: order claim → drips → tea → npm funding; writes `payee_observations` | order test | unit test | 1h |
| T2.4 | `recentlyChanged` over our observations, 30-day window | changed / not changed | unit test | 0.5h |
| T2.5 (P1) | Package→repo anti-spoof: repo `package.json` at HEAD (with `repository.directory`) declares the same name, else reserved with reason | spoof fixture reserved | unit test | 1h |
| T2.6 (P1) | Activity API push timestamp for a never-observed FUNDING file (**CONFIRM** coverage) | new file pushed < 30 days → changed | integration test | 1h |

## E3: Split (P0)

**Story.** As an owner, my budget is split by use, and no single package takes more than my cap.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T3.1 | `lib/allocation/split.ts` water-filling in bigint micro-USDC, dust floor, all-capped leftover, daily limit applied by caller | property tests DESIGN §7.1 | `pnpm test split` (fast-check) | 1.5h |

## E4: Intercepta and the decision matrix (P0)

**Story.** As an owner, my agent never pays a sanctioned, scam or lookalike address, holds anything
doubtful, and shows me why.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T4.1 | `scripts/probe-intercepta.ts`: probe the SPEC §7.4 addresses and 3 real maintainer payees (≤ 10 requests); look for an impersonation / address-poisoning endpoint in the docs (**CONFIRM**); record in `docs/intercepta-probe.md` | real responses captured | script | 0.5h |
| T4.2 | Client: `quickScan`, `tokenRisks`, `simulateTransfer`, `X-API-KEY`, 8 s timeout, `screens` rows with latency, 1 h cache | live calls work | integration test (live, skipped without key) | 1.5h |
| T4.3 | Mapping 84532 → 8453, Base Sepolia USDC → Base USDC, token pin, `SCREENED_AS` | on-screen note | unit test | 0.5h |
| T4.4 | Failure policy: timeout / HTTP / parse error → held | injected timeout → held | unit test | 0.5h |
| T4.5 | `lib/decision/matrix.ts` per DESIGN §8, pure; `lookalike.ts` | one test per step + order tests, asserting message codes | `pnpm test decision` | 2h |
| T4.6 (P1) | `spam.ts` pattern rule | 5 low-download packages sharing a payee → refused; 9 vitest-like high-download packages sharing one → not refused | unit test | 1h |
| T4.7 (P1) | `noCodeOnBase` via viem `getCode` on mainnet RPCs; required before any mainnet round | contract on Ethereum only → held | integration test | 0.5h |

## E5: x402 direct payment (P0)

**Story.** As a maintainer with a wallet, I get paid in USDC the moment the session settles, without
gas, and nobody can swap the address between the screen and the signature.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T5.1 | **CONFIRM** x402 v2 packages, header names, client hook point for a pre-sign check, Base Sepolia facilitator URL (npm + docs / Context7); pin in `decisions.md` | versions pinned | n/a | 0.5h |
| T5.2 | Resource route `GET /api/x402/credit/:id`: 409 unless outcome paid/capped with a screen < 10 min; 402 with payTo = screened payee; after settlement return the signed receipt | unpaid → 402; held → 409; paid → receipt | integration test | 2h |
| T5.3 | Settler x402 client with `beforeSign` challenge checks (payTo, asset, network, amount) | refuse → signer never called; swapped payTo → PAYTO_MISMATCH, signer never called | test with a spy signer | 1.5h |
| T5.4 | Live payment on Base Sepolia to a real maintainer mainnet address; tx hash stored; Basescan link | real tx | manual | 0.5h |

## E6: `EndCreditsEscrow` via MultiBaas (P0)

**Story.** As an owner, doubtful and unclaimed money sits in a contract that can only send it to the
payee fixed at the time, or back to me.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T6.1 | Foundry project `contracts/`, OpenZeppelin SafeERC20, `EndCreditsEscrow` per DESIGN §16, `MockUSDC` | compiles | `forge build` | 1.5h |
| T6.2 | Tests DESIGN §16.1, including the invariant; each guard test asserts its error selector; mutation pass (delete each guard, the named test fails) recorded in `decisions.md` | all green; mutation table complete | `forge test -vv` | 2.5h |
| T6.3 | **CONFIRM** MultiBaas Forge plugin; deploy to Base Sepolia through it; link `usdc`; verify on Sourcify, confirm `exact_match` | address + Sourcify match + MultiBaas label in README | Sourcify API | 1h |
| T6.4 | `lib/chain/escrow.ts` (viem) + `txqueue.ts` (one tx in flight per key); payer `approve` in seed | hold / reserve / release / refund / setClaim / claim / recordSession callable | live test on Base Sepolia | 1.5h |

## E7: Settler (P0)

**Story.** As an owner, my session settles on its own: every package gets a decision, and every
decision gets executed.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T7.1 | `worker/settler.ts` per DESIGN §7: lock, budget with daily limit, split, resolve, screen, decide (stored before any signature), execute, manifest, `recordSession` | a seeded session settles with all five outcomes represented when fixtures are present | integration test (live, Base Sepolia) | 3h |
| T7.2 | `POST /api/sessions/:id/settle` for `on_open` | 409 on second press | integration test | 0.5h |
| T7.3 | `worker/expirer.ts`: refunds expired holds (`refund` is permissionless after expiry), credit gets EXPIRED | a 60 s hold refunds | live test | 1h |

## E8: Credits roll and pages (P0)

**Story.** As an owner, and as a judge, I watch the session's credits roll and every badge land with
its reason.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T8.1 | `/credits/[id]`: film layout from `storyboard.html`, roles, rows, badges resolving from `GET /api/sessions/:id` (1 s poll), reasons, Basescan links, totals line, **Roll credits** button, NOT_A_PAYWALL footer | real session renders; badges resolve live | e2e smoke + manual on projector | 3h |
| T8.2 | `/history`: every credit with badge, reasons, screens, latency, SCREENED_AS | seeded rows visible | e2e smoke | 1h |
| T8.3 | `/owner` (dev login until E11): settings, payer balance, keys, pending holds; `/approve/[tipId]` with session approval + deny | approve releases, deny refunds, both on chain | integration test + manual on phone | 2h |
| T8.4 | `/` landing: one line, three steps, measurement table, links | renders | e2e smoke | 0.5h |

## E9: MultiBaas dashboard and webhook (P0)

**Story.** As an owner, and as Curvegrid's judge, I see what every agent paid, held, refused and
reserved this weekend, read from indexed chain events.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T9.1 | **CONFIRM** event query definition format, results endpoint, aggregation; create the five saved queries (DESIGN §15) | queries return data for the live deployment | `curl` each query | 1.5h |
| T9.2 | `lib/multibaas/client.ts` + `/api/dashboard` (15 s cache) + `/dashboard` page: five cards, package table, recent events; MultiBaas unreachable → error shown, no invented numbers | numbers equal a manual Basescan count for one session | manual cross-check + e2e smoke | 2.5h |
| T9.3 | Webhook on `Held` (and `Released`, `Refunded`): **CONFIRM** signature header; verify, de-duplicate, notification row; owner page shows it | bad signature 401; duplicate → one notification | integration test | 1.5h |

## E10: Maintainer claim (P0)

**Story.** As a maintainer, I see what agents set aside for my package and claim it in about a
minute, with a passkey and one merged PR.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T10.1 | GitHub OAuth App login (**CONFIRM** scope), maintainer row, encrypted token | sign-in works on the fixed domain | manual | 1h |
| T10.2 | **CONFIRM** Coinbase Smart Wallet SDK and smart-wallet-only option on Base Sepolia; passkey wallet creation on `/npm/[name]`; `POST /api/claim/:pkg/wallet` with push/admin check | NO_PERMISSION for a repo without push; wallet stored | integration test (permission) + manual (passkey on phone and laptop) | 2h |
| T10.3 | `POST /api/claim/:pkg/pr`: branch, `FUNDING.json`, PR; fallback new-file link on 403/404 | PR opened on the fixture repo | live test on a rehearsal fixture, never on `unclaimed-utils` | 1.5h |
| T10.4 | `GET /api/claim/:pkg/status`: merged → read file on default branch → match → screen → `setClaim` + `claim` for every package key of the repo | FUNDING_MISMATCH blocks; screened critical → refused; merged + match → claimed, funds in the wallet | integration tests + live run | 2h |
| T10.5 | `/npm/[name]` page: CLAIM_HEADLINE from MultiBaas `reserved_by_package`, also-accepts links, ALREADY_PAYABLE, COOLING | renders all states | e2e smoke | 1.5h |

## E11: World ID for Agents (P1 as a whole; built last)

**Story.** As an owner, money my agent held only moves when I, a verified human, approve that exact
tip with a fresh World ID verification.

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T11.1 | Register the production client (he does it in the portal: **CONFIRM** URL); `openid-client` confidential client; owner sign-in code + PKCE (DESIGN §14.1) binding `(iss, sub)` | sign-in with World App on the fixed domain | manual + integration test with a mocked token endpoint | 1.5h |
| T11.2 | `verifyIdToken`: SIG, ISS, AUD, EXP, NONCE, ACR, AMR | each failing token rejected with its code | unit tests, one per check | 1.5h |
| T11.3 | Approval step-up (DESIGN §14.2): payload, nonce, `max_age=0`, `prompt=login`, `acr_values`, PKCE; callback checks; `release(tipId, approvalRef)` | approve on the phone releases; the badge turns paid | manual on phone + integration test | 2h |
| T11.4 | Denied paths: cancelled, stale `auth_time`, wrong nonce, other `sub`; each shows its message and releases nothing; `WORLD_REQUIRED=true` disables dev login and session approval | each path | unit tests asserting message codes + one e2e | 1.5h |
| T11.5 (P1) | `endcredits login` via device grant; agent key bound to `(iss, sub)` | denied / expired device code → no key | integration test | 2h |
| T11.6 | World debrief notes kept during E11 (time to first success, friction, missing docs, one improvement) | in README | n/a | 0.25h |

## E12: Demo state, docs, submission (P0)

| ID | Ticket | Acceptance | Check | Est |
|---|---|---|---|---|
| T12.1 | Publish the `@endcredits-demo` fixtures and their repos (DESIGN §18), including the rehearsal and finalist claim fixtures | installable from npm | `npm view @endcredits-demo/moved-payout` | 1h |
| T12.2 | Demo repo `endcredits-demo-reports`; `scripts/probe-payees.ts` on its real deps; drop any real package that comes back held or refused | probe table in `docs/intercepta-probe.md` | script | 1h |
| T12.3 | Warm-up session (observes address A), change `moved-payout` to B, confirm held on a dry settle | held with HELD_CHANGED | `endcredits attribute` + settle on a copy | 0.5h |
| T12.4 | History seeds from real runs: one expired hold (TTL 60 s), one denied hold | both in `/history` | manual | 0.5h |
| T12.5 | README per DESIGN §19; sponsor checklist ticked (Intercepta files + feedback, Curvegrid five items, World debrief) | every requirement ticked | checklist | 1.5h |
| T12.6 | Demo video 2-4 min, ≥ 720p, real voice, not sped up | uploaded | n/a | 1.5h |
| T12.7 | Rehearse the SPEC §12 demo three times on hotspot; record the fallback video | core path ≤ 2 min | stopwatch | 1h |
| T12.8 | Submit: Classic track, partners Intercepta, Curvegrid, World, before Sun 09:00 JST | submitted | n/a | 0.5h |

## P2

| ID | Ticket | Est |
|---|---|---|
| T-P2.1 | Telegram message with the approve link on `Held` | 0.5h |
| T-P2.2 | Context7 MCP tool calls as a `docs` signal | 1h |
| T-P2.3 | Pay maintainer-hosted x402 tip endpoints listed in metadata | 2h |
| T-P2.4 | Mainnet tip round on Base 8453 (his decision; needs T4.7) | 1h |
| T-P2.5 | PyPI packages (`site-packages` reads, `pip install`, `import x`) | 3h |

---

## Order of execution

Hacking started Friday 25 Sep. Everything that does not need World goes first; World is last.

1. **Friday, first hour:** SPEC §16 setup (Railway, MultiBaas deployment, GitHub OAuth App, npm org,
   wallets funded); T0.1-T0.5; T1.1, T4.1 (as soon as the Intercepta key is in), T5.1, T6.3's
   CONFIRM step, T10.2's CONFIRM step.
2. **Friday, parallel worktrees** (no shared files): E1 (T1.2-T1.7) | E2 + E3 (T2.1-T2.4, T3.1) |
   E6 (T6.1-T6.2). Then T6.3-T6.4, E4 (T4.2-T4.5).
3. **Friday night:** T12.1 fixtures published; T12.3 warm-up session run (the address change needs
   time to be "recent" but our window only needs a prior observation).
4. **Saturday morning:** E5 → E7 → E8 (T8.1 first). First full real session settles on Base Sepolia.
5. **Saturday afternoon:** E9 (dashboard + webhook) → E10 (claim).
6. **Saturday evening checkpoint:** every P0 ticket merged; README sponsor sections drafted (T12.5).
   Decide the mainnet round (no by default).
7. **Saturday night:** E11 (T11.1-T11.4, T11.6), then P1 in this order: T4.6 spam, T2.5 anti-spoof,
   T11.5 device login, T2.6, T4.7.
8. **Sunday early morning:** T12.2 probe, record the demo session, T12.4, T12.6-T12.8. Nothing new
   after the video is recorded.

P0 total ≈ 65h of agent execution, E11 adds ≈ 9h. Wall time fits only with parallel agents on
E1 / E2+E3 / E6 and him reviewing every merge. If Saturday evening is missed, cut from the top of the
cut order, starting with E11's P1 parts, then E11 entirely.
