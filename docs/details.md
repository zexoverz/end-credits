# Details: attribution, limits, measurement, deployment, fixtures

## Attribution weights and caps

These are ours, not a standard. They exist so that a prompt-injected README telling the agent to read
one package 1,000 times moves at most 10 points.

| Signal | Captured from | Weight | Cap per package per session |
|---|---|---|---|
| `dep_added` | `package.json` dependency diff between session start and end, or an `npm/pnpm/yarn/bun add` | 5 | once |
| `import` | `import` / `require` / `export … from` in written or edited files | 3 per distinct file | 5 files |
| `docs` | a fetched URL that maps to an installed package (homepage, repo, npm page, unpkg, jsdelivr) | 2 per distinct URL | 5 URLs |
| `read` | a read under `node_modules/<pkg>/` | 1 per distinct file | 10 files |

`score = Σ weight × min(distinct items, cap)`. A package counts only if it is installed at settle
time; `import` and `dep_added` also require a direct dependency, so transitive packages earn nothing
unless the agent read them. Code: [`lib/attribution/score.ts`](../lib/attribution/score.ts),
[`lib/attribution/specifier.ts`](../lib/attribution/specifier.ts); the server recomputes with
[`lib/settle/scores.ts`](../lib/settle/scores.ts) and does not trust the CLI's numbers.

Demo defaults: 2.00 USDC per session, 0.25 USDC cap per package, 20 USDC daily limit, 24 h hold TTL.

## Honest limits

1. Attribution is a proxy. What the agent read and wrote is evidence of use, not a measure of value.
2. Transitive dependencies earn nothing unless the agent read them. Deep infrastructure is
   under-credited; this is a deliberate trade against farming.
3. The payee is whatever the repo publishes. A compromised repo can change it; we hold on change and
   screen before signing, but cannot prove who wrote the file beyond "it is on the default branch".
4. `tea.yaml` addresses come from a scheme that was farmed; they are screened like every other.
5. The payer key is server-held and everything moves on Base Sepolia. What is screened is the
   payees' real mainnet addresses. With `EndCreditsBudget` the key is only a spender with a capped
   pull on the owner's wallet, so a stolen key takes at most the cap (worst case `2 x perPeriod`
   across a window edge). It still pays from its own address, so it is the escrow payer: it could
   call `setApprover` as the payer; the 3-day delay makes that change public before it counts, and
   holds with the default 24 h TTL expire and refund before then.
6. USDC pulled but not spent passes through the agent key on its way back: a share whose x402 or
   escrow call fails after the pull, and a denied or expired tip the escrow refunds to the agent key,
   are transferred back to the owner's budget wallet by the agent key. A failed transfer is retried
   every 30 s by the expirer, so until it goes through the money sits on the agent key. An x402
   payment that errors on our side but settles later could make that return spend the agent key's
   own balance.
7. The claim needs a merged PR; orgs that restrict OAuth apps use the prefilled "new file" link, whose
   `filename` and `value` parameters are known from use, not from GitHub's docs. We ask for
   `public_repo`, which GitHub's docs contradict each other on for writing contents.
8. The public Base Sepolia RPC is load-balanced over nodes that lag each other. Writes re-simulate on
   a revert, and the tx queue keeps the last nonce a node accepted per key, so back-to-back sends do
   not reuse a nonce ([`lib/chain/txqueue.ts`](../lib/chain/txqueue.ts)). That memory is per process: two
   processes signing with one key could still collide, and `already known` is not retried, since it
   may mean our own tx went through. Reads such as `tipOf` or `reserved` right after a receipt can
   still be a block or two behind.
9. The last commit touching `FUNDING.json` may be a formatting change, which then reads as an address
   change and holds. The cost is a hold, not a payment.
10. Rule 7 (contract on Ethereum with no code on Base) only runs with `CHECK_NO_CODE=true`; it matters
    for a mainnet round, not for testnet.
11. The dashboard is cached for 60 s to stay inside the MultiBaas free plan. Owner notifications have
    no mark-read yet.
12. The owner signs in with their wallet (SIWE). `OWNER_DEV_TOKEN` still works for scripts, so a
    deployment that sets it has a second way in; the release guard is the on-chain approver
    signature either way. A World ID sign-in is in [`lib/world/`](../lib/world) but off.
13. USDC sent straight to the escrow address (not through `hold` or `reserve`) is stuck. Nothing reads
    the balance, so this is left as is.
14. A new payee with no mainnet history holds (`HELD_NO_HISTORY`). As a claim wallet the same answer
    passes the screen, since new passkey wallets are fresh; the claim is still gated by repo write
    access and the funding file.
15. Payment simulation is off on testnet (see [Feedback on the API](intercepta.md#feedback-on-the-api)), so a paid
    credit is screened by payee, impersonation and token, not by simulating the transfer.

## Measurement

[`scripts/measure-funding.py`](../scripts/measure-funding.py), run 25 Sep 2026 on the top 1,000 npm
packages by downloads (`npm-high-impact@1.13.0`, as `top1000.json` next to the script).

Method: for each name, read `funding` and `repository` from the registry's `latest`; for each distinct
GitHub repo, fetch `FUNDING.json` (Drips), `funding.json`, `tea.yaml` and `.github/FUNDING.yml` at
`HEAD`. A package is payable when any of those, or its npm `funding` field, contains a `0x` address.
Percentages are over all 1,000 names; 929 were read from the registry (71 stayed rate-limited), 928
resolved to a GitHub repo (640 distinct).

| Metadata | Share |
|---|---|
| Any funding metadata (npm `funding` field or any funding file) | **41.6%** |
| npm `funding` field | 27.9% |
| `.github/FUNDING.yml` | 27.2% |
| **A payable wallet address anywhere** | **2.1%** (21 packages: 17 via Drips `FUNDING.json`, 4 via `tea.yaml`) |

The 21 payable packages are 10 repositories (`vitest` alone is 9 packages). Four in ten top packages
ask for money; one in fifty can receive it from an agent. The rest is reserved until its maintainer
claims.

## Deployed

All on Base Sepolia (chain `84532`). Testnet keys only.

| Role | Address |
|---|---|
| `EndCreditsEscrow` v2 (owner-signed release) | [`0x849F6cd44e4A3248d033aBB1b670257F77bFCc46`](https://sepolia.basescan.org/address/0x849F6cd44e4A3248d033aBB1b670257F77bFCc46#code), Sourcify `exact_match`, `changeDelay` 3 days |
| `EndCreditsBudget` (owner's spend cap for the agent key) | [`0x1429498C0E6F2f474a5BD3230e79a838E3590b36`](https://sepolia.basescan.org/address/0x1429498c0e6f2f474a5bd3230e79a838e3590b36#code), Sourcify `exact_match`, MultiBaas alias `budget` |
| `EndCreditsEscrow` v1 (superseded 26 Sep) | [`0x63047583FbCe241D72d71137C940aa27BBdC60f1`](https://sepolia.basescan.org/address/0x63047583FbCe241D72d71137C940aa27BBdC60f1#code), Sourcify `exact_match`, `changeDelay` 3 days |
| Payer, now the agent key (`pull` from the budget, x402 signatures, `hold`, `reserve`) | [`0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6`](https://sepolia.basescan.org/address/0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6) |
| Recorder (`release`, `refund`, `setClaim`, `claim`, `recordSession`) | [`0xc8e1Bc6B6c1AD5275935B313288b2c6FF45472A8`](https://sepolia.basescan.org/address/0xc8e1Bc6B6c1AD5275935B313288b2c6FF45472A8) |
| Receipt signer (x402 credit receipts, signs off chain) | `0xCD5f2A9eB66463aea82a6E41E03D42b798cD6725` |
| Deployer | [`0xfa064a16bDeD4C82aa6b3D4c656a640CeD547A13`](https://sepolia.basescan.org/address/0xfa064a16bDeD4C82aa6b3D4c656a640CeD547A13) |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

v2 deploy tx
[`0x7f4f4f1fabbb7bca64b0b4babd0752ec71f6519339588c72efc3a25548111fb2`](https://sepolia.basescan.org/tx/0x7f4f4f1fabbb7bca64b0b4babd0752ec71f6519339588c72efc3a25548111fb2),
sent through the forge-multibaas plugin, which moved the MultiBaas `escrow` alias to v2 as
`endcredits_escrow` 2.0. v1 held only test events; the dashboard history starts at v2. The MultiBaas deployment (free plan, Base Sepolia) links the
escrow as `escrow` and USDC as `usdc`, holds the six saved queries, and posts to
`/api/webhooks/multibaas` through the webhook `endcredits`. Live checks on 26 Sep: hold then refund
round trips indexed by MultiBaas, `Held` and `Refunded` delivered by the webhook, owner notifications
created.

A first `EndCreditsBudget` at `0xd35cb8b89a219df7320eb0e9b47969cc709cc5c5` was built from a stale
artifact, could not be verified against the final source, and is not used.

The contract is in [`contracts/src/EndCreditsEscrow.sol`](../contracts/src/EndCreditsEscrow.sol). Every
guard has a test that asserts its custom error selector; deleting each guard in turn makes its named
test fail (the mutation table is in [`docs/plan/decisions.md`](plan/decisions.md)).

## Demo fixtures

The held and refused rows in the demo are always our own packages under `@endcredits-demo`, never a
real package. Each README starts with "Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real
library." Sources are in [`fixtures/`](../fixtures), addresses in
[`fixtures/ADDRESSES.md`](../fixtures/ADDRESSES.md).

| Package | Repo | `FUNDING.json` | Outcome |
|---|---|---|---|
| `@endcredits-demo/moved-payout` | [endcredits-fixture-moved-payout](https://github.com/zexoverz/endcredits-fixture-moved-payout) | A, then B | `held`, `ADDRESS_CHANGED` |
| `@endcredits-demo/left-padder-pro` | [endcredits-fixture-left-padder-pro](https://github.com/zexoverz/endcredits-fixture-left-padder-pro) | an OFAC SDN address | `refused` by Intercepta |
| `@endcredits-demo/unclaimed-utils` | [endcredits-fixture-unclaimed-utils](https://github.com/zexoverz/endcredits-fixture-unclaimed-utils) | none | `reserved`, claimed live in the judged demo |
| `@endcredits-demo/unclaimed-rehearsal-1..3` | [1](https://github.com/zexoverz/endcredits-fixture-unclaimed-rehearsal-1), [2](https://github.com/zexoverz/endcredits-fixture-unclaimed-rehearsal-2), [3](https://github.com/zexoverz/endcredits-fixture-unclaimed-rehearsal-3) | none | `reserved`, claimed in a rehearsal |
| `@endcredits-demo/unclaimed-finalist` | [endcredits-fixture-unclaimed-finalist](https://github.com/zexoverz/endcredits-fixture-unclaimed-finalist) | none | `reserved`, claimed in the finalist run |

Why they exist: a refusal needs an address Intercepta flags for a reason nobody disputes
(`0x098B716B8Aaf21512996dC57EB0615e2383E2f96`, Lazarus Group / Ronin, SDN.CSV entry 27307), and a
hold needs an address that changed during the hackathon. Pointing either at a real package would
label a real maintainer as suspicious. A claim is one-shot (after the merge the package is payable),
so every rehearsal gets its own unclaimed package. If a real package's payee comes back medium or
high risk during prep, that package is left out of the demo session.

The demo app is [zexoverz/endcredits-demo-reports](https://github.com/zexoverz/endcredits-demo-reports)
(Next.js, `zod`, `date-fns`, `@tanstack/react-query`, `react-day-picker`, plus the fixtures). The
fixtures install from GitHub (`pnpm add @endcredits-demo/moved-payout@github:zexoverz/endcredits-fixture-moved-payout`),
since they are not on the npm registry; the settler then takes the repository from the installed
`package.json` and says so (`REPO_DECLARED`).

## Setup and testing

Node 20+, pnpm 10, Postgres, Foundry.

```sh
git clone --recurse-submodules https://github.com/zexoverz/end-credits
cd end-credits
pnpm install
```

### Environment

Names only; values go in `.env` (gitignored) or the Railway service. [`lib/env.ts`](../lib/env.ts)
checks the boot set and throws `Missing required env: <NAME>` on the first read of anything else.

| Group | Variables |
|---|---|
| Web boot | `APP_URL`, `DATABASE_URL`, `SESSION_SECRET` |
| Worker boot | `APP_URL`, `DATABASE_URL`, `INTERCEPTA_API_KEY`, `INTERCEPTA_BASE`, `BASE_SEPOLIA_RPC`, `USDC_ADDRESS`, `ESCROW_ADDRESS`, `PAYER_PRIVATE_KEY`, `RECORDER_PRIVATE_KEY`, `X402_FACILITATOR_URL` |
| x402 resource | `RECEIPT_SIGNING_KEY` |
| Owner login | wallet sign-in builds the chain client, so the web service also needs `BASE_SEPOLIA_RPC`, `USDC_ADDRESS`, `ESCROW_ADDRESS`, `PAYER_PRIVATE_KEY`, `RECORDER_PRIVATE_KEY`; `OWNER_DEV_TOKEN` (optional, scripts only) |
| Budget wallet (optional) | `BUDGET_ADDRESS` |
| Escrow v2 seed | `APPROVER_ADDRESS` (the owner's approver wallet, named by the payer on first seed) |
| Optional World ID (off unless `WORLD_REQUIRED=true`) | `WORLD_REQUIRED`, `APPROVE_METHOD`, `WORLD_ISSUER`, `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET`, `APPROVE_SALT` |
| MultiBaas | `MULTIBAAS_URL`, `MULTIBAAS_API_KEY`, `MULTIBAAS_WEBHOOK_SECRET`, `PAYER_ADDRESS` (optional) |
| GitHub claim | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_TOKEN_READ` (optional, rate limit) |
| Optional | `ETH_MAINNET_RPC`, `BASE_MAINNET_RPC`, `CHECK_NO_CODE`, `SIMULATE_PAYMENTS` (mainnet payer only) |
| CLI | `ENDCREDITS_HOME`, `ENDCREDITS_NO_OPEN` |
| Tests | `TEST_DATABASE_URL`, `LIVE`, `OFFLINE` |

### Run

```sh
pnpm drizzle-kit migrate      # DATABASE_URL
pnpm seed                     # demo owner; --write-config also writes a dev agent key
pnpm dev                      # web
pnpm worker                   # settler every 2 s, expirer every 30 s
```

### Owner setup

The owner signs in with their wallet: Sign-In with Ethereum (EIP-4361) on Base Sepolia, chain
`84532`, on the fixed `APP_URL` host ([`lib/auth/wallet.ts`](../lib/auth/wallet.ts),
[`app/api/auth/wallet/nonce/route.ts`](../app/api/auth/wallet/nonce/route.ts),
[`app/api/auth/wallet/route.ts`](../app/api/auth/wallet/route.ts)). Nonces expire after 10 minutes and
are single use: a used nonce is stored, so replaying an old cookie fails. The first sign-in binds the
wallet only if it is the owner's on-chain approver (or none is set yet); later sign-ins must be that
wallet. EOAs, ERC-1271 and not-yet-deployed passkey wallets (ERC-6492) all verify.

`GET /api/owner/onboarding` ([`lib/owner/onboarding.ts`](../lib/owner/onboarding.ts)) returns the
checklist in order with the next step to do: signed in, wallet bound, budget set, approver set, spend
allowance on `EndCreditsBudget`, agent key, first session.

`OWNER_DEV_TOKEN` (`POST /api/auth/dev`) remains for scripts and local runs.

### CLI

```sh
pnpm --filter endcredits build          # cli/dist/endcredits.mjs
cd cli && npm link && cd ..             # puts `endcredits` on PATH for the hooks
endcredits init                         # hooks into ./.claude/settings.json (--global for ~/.claude)
endcredits key <token> --api https://end-credits.up.railway.app   # key from the Owner page
endcredits attribute --session <id> --dry-run   # the table and upload body, nothing sent
```

### Tests

| Command | What runs |
|---|---|
| `pnpm test` | unit tests; Postgres integration tests skip without `TEST_DATABASE_URL` |
| `TEST_DATABASE_URL=<migrated db> pnpm test` | also the integration tests (settle, approve, history, owner, and the optional World code), one file at a time |
| with `anvil` on PATH and `contracts/out` built (`forge build`) | also `lib/chain/escrow.anvil.test.ts` against the real contract; `lib/settle/settle.anvil.test.ts` also needs `TEST_DATABASE_URL` |
| `OFFLINE=1 pnpm test` | skips the mainnet `getCode` test |
| `LIVE=1` / `INTERCEPTA_API_KEY=…` | adds the live npm registry and live Intercepta tests |
| `cd contracts && forge test -vv` | escrow unit, fuzz and invariant tests |

Mocks live only inside tests; the app calls Intercepta, MultiBaas and the x402 facilitator for real.
