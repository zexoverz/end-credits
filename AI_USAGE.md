# AI usage

ETHGlobal asks projects to document where AI tools were used. Each ticket in
`docs/plan/TICKETS.md` is logged here when it lands: the ticket, the files an AI coding agent
(Claude Code) wrote or changed, and what the builder reviewed or rewrote by hand.

| Ticket | Files written or changed with AI | Reviewed by the builder |
|---|---|---|
| plan | `docs/plan/*` drafted with Claude from the builder's research and decisions | every section |
| T6.1 | `contracts/foundry.toml`, `contracts/foundry.lock`, `.gitmodules`, `contracts/src/EndCreditsEscrow.sol`, `contracts/test/mocks/MockUSDC.sol`, `contracts/script/Deploy.s.sol`, `docs/plan/decisions.md` | pending review |
| T6.2 | `contracts/test/EndCreditsEscrow.t.sol`, `contracts/test/EndCreditsEscrow.invariant.t.sol`, `docs/plan/decisions.md` (mutation table) | pending review |
| T0.1 | `package.json`, `pnpm-workspace.yaml`, `app/*` (create-next-app output), `cli/package.json`, `cli/src/index.ts`, `worker/index.ts`, `vitest.config.ts`, `.gitignore` | pending review |
| T0.2 | `app/api/health/route.ts`; Railway project, services and domain set up by the agent through the Railway MCP | pending review |
| T0.3 | `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`, `drizzle/0000_init.sql` | pending review |
| T0.4 | `lib/env.ts`, `lib/env.test.ts`, `instrumentation.ts` | pending review |
| T0.5 | `lib/messages.ts`, `lib/messages.test.ts` | pending review |
| T1.2 | `cli/src/init.ts`, `cli/src/config.ts`, `cli/src/paths.ts`, `cli/src/args.ts`, `cli/src/index.ts`, their tests, `lib/messages.ts` (CLI strings) | pending review |
| T1.4 | `lib/attribution/specifier.ts`, `lib/attribution/specifier.test.ts` | pending review |
| T1.3 | `cli/src/start.ts`, `cli/src/record.ts`, `cli/src/bash.ts`, `cli/src/hook.ts`, `lib/attribution/types.ts`, their tests, `cli/src/hooks.process.test.ts` | pending review |
| T1.5 | `lib/attribution/score.ts`, `lib/attribution/docs.ts`, `lib/attribution/score.test.ts` | pending review |
| T1.6 | `cli/src/attribute.ts`, `cli/src/settle.ts`, `cli/src/fixture.ts`, `cli/src/index.ts`, their tests | pending review |
| T1.7 | `lib/sessions/schema.ts`, `lib/sessions/auth.ts`, `lib/sessions/ingest.ts`, `lib/sessions/view.ts`, `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `lib/sessions/schema.test.ts`, `app/api/sessions/sessions.test.ts` | pending review |
| T2.1 | `lib/registry/npm.ts`, `lib/registry/npm.test.ts`, `lib/registry/npm.live.test.ts` | pending review |
| T2.2 | `lib/payee/parse.ts`, `lib/payee/parse.test.ts`, `lib/payee/__fixtures__/*` (fetched from GitHub) | pending review |
| T2.3 | `lib/payee/resolve.ts`, `lib/payee/resolve.test.ts`, `lib/payee/keys.ts`, `lib/payee/keys.test.ts`, `lib/payee/observe.ts`, `lib/payee/github.ts`, `lib/payee/__fixtures__/memory-store.ts` | pending review |
| T2.4 | `lib/payee/change.ts`, `lib/payee/change.test.ts` | pending review |
| T2.5 | `lib/payee/spoof.ts`, `lib/payee/resolve.ts`, `lib/payee/resolve.test.ts`, `lib/messages.ts` (`SPOOF_REPO`), `lib/messages.test.ts`, `lib/payee/__fixtures__/*.package.json` | pending review |
| T2.6 | `lib/payee/push.ts`, `lib/payee/push.test.ts`, `lib/payee/change.ts`, `lib/payee/change.test.ts`, `docs/plan/decisions.md` (Activity API CONFIRM) | pending review |
| T3.1 | `lib/allocation/split.ts`, `lib/allocation/split.test.ts` | pending review |
| T4.1 | `scripts/probe-intercepta.ts` (not run yet: no key) | pending review |
| T4.2 | `lib/intercepta/client.ts`, `http.ts`, `schemas.ts`, `cache.ts`, `repo.ts`, `__fixtures__/memory-repo.ts`, `client.test.ts`, `client.live.test.ts`, `cache.test.ts`, `lib/db/schema.ts`, `drizzle/0001_screens_impersonation.sql` | pending review |
| T4.3 | `lib/intercepta/mapping.ts`, `mapping.test.ts` | pending review |
| T4.4 | failure policy in `lib/intercepta/http.ts`, `client.ts`, `lib/decision/matrix.ts`; tests in `client.test.ts`, `matrix.test.ts` | pending review |
| T4.5 | `lib/decision/types.ts`, `matrix.ts`, `lookalike.ts`, their tests, `lib/messages.ts` (`IMPERSONATION`) | pending review |
| T4.6 | `lib/decision/spam.ts`, `spam.test.ts` | pending review |
| T4.7 | `lib/decision/no-code.ts`, `no-code.test.ts` | pending review |
| T6.3 prep | `contracts/script/Deploy.s.sol` (MultiBaas link), `contracts/foundry.toml`, `contracts/foundry.lock`, `.gitmodules` (`forge-multibaas`), `docs/plan/decisions.md`; no Base Sepolia deploy yet | pending review |
| T6.4 | `lib/chain/abi.ts`, `lib/chain/keys.ts`, `lib/chain/txqueue.ts`, `lib/chain/escrow.ts` and their tests, `scripts/gen-abi.ts`, `scripts/seed-approve.ts`, `docs/plan/decisions.md` | pending review |
| T5.2 | `lib/x402/constants.ts`, `lib/x402/receipt.ts`, `lib/x402/receipt.test.ts`, `lib/x402/server.ts`, `lib/x402/server.test.ts`, `lib/x402/repo.ts`, `lib/x402/deps.ts`, `app/api/x402/credit/[creditId]/route.ts`, `lib/messages.ts` (`NOT_PAYABLE`), `lib/messages.test.ts` | pending review |
| T5.3 | `lib/x402/client.ts`, `lib/x402/client.test.ts`, `scripts/x402-smoke.ts`; the smoke payment on Base Sepolia was run by the agent | pending review |
| T7.1 | `lib/settle/scores.ts`, `manifest.ts`, `store.ts`, `settle.ts`, `run.ts`, `deps.ts`, their tests (`settle.test.ts` on Postgres, `settle.anvil.test.ts` on anvil + Postgres), `worker/loop.ts`, `loop.test.ts`, `worker/settler.ts`, `worker/index.ts`, `lib/messages.ts` (`RESOLVE_FAILED`, `EXECUTION_FAILED`), `lib/messages.test.ts` | pending review |
| T7.2 | `lib/auth/owner.ts`, `app/api/sessions/[id]/settle/route.ts`, `app/api/sessions/[id]/settle/settle.test.ts` | pending review |
| T7.3 | `lib/settle/expire.ts`, `lib/settle/expire.test.ts`, `worker/expirer.ts` | pending review |
| E7 seed | `scripts/seed.ts` (run twice against a local Postgres; `--write-config` not run) | pending review |
| T8.2 backend | `lib/history/history.ts`, `lib/history/history.test.ts`, `app/api/history/route.ts`, `lib/money.ts` | pending review |
| T8.3 backend | `lib/auth/owner.ts`, `lib/auth/dev.ts`, their tests, `app/api/auth/{dev,logout}/route.ts`, `lib/owner/*`, `app/api/owner/**`, `lib/approve/*`, `app/api/approve/[tipId]/**`, `lib/__fixtures__/owner-db.ts`, `docs/plan/decisions.md` (E8 backend) | pending review |
| T9.1 | `lib/multibaas/queries.ts`, `lib/multibaas/queries.test.ts`, `scripts/multibaas-setup.ts` (not run yet: no MultiBaas deployment), `docs/plan/decisions.md` (E9) | pending review |
| T9.2 backend | `lib/multibaas/client.ts`, `rows.ts`, `dashboard.ts`, `repo.ts`, `deps.ts`, their tests, `lib/multibaas/__fixtures__/dashboard.ts`, `app/api/dashboard/route.ts` | pending review |
| T9.3 | `lib/multibaas/webhook.ts`, `lib/multibaas/webhook.test.ts`, `lib/multibaas/repo.ts` (webhook repo), `app/api/webhooks/multibaas/route.ts` | pending review |
| T10.1 | `lib/crypto/seal.ts`, `lib/crypto/seal.test.ts`, `lib/claim/session.ts`, `lib/github/oauth.ts`, `lib/github/oauth.test.ts`, `lib/github/env.ts`, `lib/github/api.ts`, `lib/github/api.test.ts`, `lib/github/__fixtures__/fake-github.ts`, `app/api/github/login/route.ts`, `app/api/github/callback/route.ts` | pending review |
| T10.2 (backend) | `lib/claim/wallet.ts`, `lib/claim/context.ts`, `lib/claim/store.ts`, `lib/claim/deps.ts`, `lib/claim/view.ts`, `lib/claim/http.ts`, `lib/claim/env.ts`, `app/api/claim/[...slug]/route.ts`, `lib/claim/claim.int.test.ts`, `lib/claim/__fixtures__/fakes.ts` | pending review |
| T10.3 (backend) | `lib/github/claim.ts`, `lib/github/claim.test.ts`, `lib/claim/pr.ts`, `lib/messages.ts` (`PR_LINK`), `lib/messages.test.ts` | pending review |
| T10.4 (backend) | `lib/claim/status.ts`, `lib/claim/payout.ts`, `lib/db/schema.ts` (`claims.claimed_micro`), `drizzle/0002_claim_amount.sql` | pending review |
| T10.5 (backend) | `lib/claim/summary.ts`, `lib/claim/summary.int.test.ts`, `app/api/npm/[...name]/route.ts`; no page yet | pending review |
| T11.1 | `lib/world/config.ts`, `exchange.ts`, `owner.ts`, `session.ts`, `oidc.ts`, `oidc.test.ts`, `lib/world/__fixtures__/idp.ts`, `app/api/auth/world/{start,callback}/route.ts`, `package.json` (`openid-client`, `jose`), `docs/plan/decisions.md` (E11) | pending review |
| T11.2 | `lib/world/verify.ts`, `lib/world/verify.test.ts` | pending review |
| T11.3 | `lib/world/nonce.ts`, `nonce.test.ts`, `stepup.ts`, `approve-callback.ts`, `app/api/approve/callback/route.ts`, `lib/approve/actions.ts` (shared release outcome), `lib/approve/hold.ts` (package key), `lib/approve/handlers.ts` (start hands off to World), `lib/messages.ts` (`UNKNOWN_STATE`, `VERIFY_FAILED`) | pending review |
| T11.4 | `lib/world/stepup.test.ts`, `lib/approve/approve.test.ts` (WORLD_REQUIRED start), `lib/messages.test.ts` | pending review |
| T11.5 | `lib/world/device.ts`, `device.test.ts`, `app/api/agent/device/{start,poll}/route.ts`, `cli/src/login.ts`, `cli/src/login.test.ts`, `cli/src/index.ts`, `lib/messages.ts` (`LOGIN_*`) | pending review |
| T11.6 | `docs/world-debrief.md` (build-time notes; live parts left for the human) | pending review |
