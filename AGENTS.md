# AGENTS.md: End Credits (ETHGlobal Tokyo 2026)

Copy to the repo root at `git init`. Every coding agent reads this first.

## What this is
At the end of a Claude Code session, End Credits splits the owner's budget across the open-source
packages the session used, screens every payee with Intercepta before signing, pays over x402, and
holds or reserves the rest in `EndCreditsEscrow`. Plan: `docs/plan/SPEC.md`, design:
`docs/plan/DESIGN.md`, tickets: `docs/plan/TICKETS.md`. Work one ticket at a time, by ID.

## Hard rules
1. **ETHGlobal requires documenting AI use.** After each ticket, append to `AI_USAGE.md`: ticket ID,
   files you wrote or changed, what the human reviewed. Never skip this.
2. **Small commits, plain messages.** Several commits per ticket. No squashing into one. No
   attribution trailers.
3. **Never mock a sponsor call in product code.** Intercepta, MultiBaas and World are live in the
   app; mocks only inside tests.
4. **Tests must fail for the right reason.** Every guard gets a test that fails when the guard is
   removed and asserts the specific message code or custom error selector.
5. **No secrets in the repo.** Env vars only; `.env` is gitignored; never print keys or tokens in
   logs.
6. **The decision is recorded before any signature.** No code path may build an x402 authorization or
   send an escrow tx for a credit without a stored decision of the right outcome.
7. **Timeout or error from Intercepta means hold, never pay.**
8. **Check the 402 challenge before signing:** `payTo` equals the screened payee, asset is the pinned
   USDC, network is `eip155:84532`, amount within the allocation.
9. **Never label a real package as bad.** Bad-actor and held examples use `@endcredits-demo/*`
   fixtures only.
10. **The hook never breaks a session.** `endcredits record` always exits 0, prints nothing to stdout,
    and sends no code or repo paths anywhere.
11. **Commit dates are never evidence.** Address changes are judged from our own observation times
    (and, P1, GitHub's server-set timestamps).
12. **World ID:** scope `openid` only; validate `iss`, `aud`, `exp`, `nonce`, `acr`, `amr`,
    `auth_time` server-side; never trust a client-side result. One fixed HTTPS hostname for all
    callbacks; never test sign-in on preview URLs.
13. Check library APIs against current docs (Context7 or the package README), not memory. Anything
    marked **CONFIRM** in the plan is resolved and pinned in `docs/plan/decisions.md` before use.
14. All user-facing strings come from `lib/messages.ts`.

## Commands
- `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm worker`
- `pnpm drizzle-kit migrate`, `pnpm seed`
- `cd contracts && forge build && forge test -vv`
- `pnpm --filter cli build`, then `endcredits attribute --session <id> --dry-run`

## Layout
- `app/` Next.js routes and pages
- `cli/` the `endcredits` CLI and Claude Code hooks
- `lib/attribution/` signals, specifier parsing, scoring (shared with `cli/`)
- `lib/allocation/` the split
- `lib/registry/`, `lib/payee/` npm metadata, payee resolution, change detection
- `lib/intercepta/` client, cache, mapping
- `lib/decision/` the matrix, lookalike and spam rules
- `lib/x402/` resource route and settler client
- `lib/chain/`, `lib/multibaas/` escrow calls, tx queue, event queries, webhook
- `lib/github/` maintainer sign-in and the claim PR
- `lib/world/` OIDC client, step-up, device grant
- `worker/` settler and expirer
- `contracts/` Foundry, `EndCreditsEscrow`
- `docs/plan/` the plan; `docs/plan/decisions.md` for choices made during the build
