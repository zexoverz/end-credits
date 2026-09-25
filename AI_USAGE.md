# AI usage

ETHGlobal asks projects to document where AI tools were used. Each ticket in
`docs/plan/TICKETS.md` is logged here when it lands: the ticket, the files an AI coding agent
(Claude Code) wrote or changed, and what the builder reviewed or rewrote by hand.

| Ticket | Files written or changed with AI | Reviewed by the builder |
|---|---|---|
| plan | `docs/plan/*` drafted with Claude from the builder's research and decisions | every section |
| T0.1 | `package.json`, `pnpm-workspace.yaml`, `app/*` (create-next-app output), `cli/package.json`, `cli/src/index.ts`, `worker/index.ts`, `vitest.config.ts`, `.gitignore` | pending review |
| T0.2 | `app/api/health/route.ts`; Railway project, services and domain set up by the agent through the Railway MCP | pending review |
| T0.3 | `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`, `drizzle/0000_init.sql` | pending review |
| T0.4 | `lib/env.ts`, `lib/env.test.ts`, `instrumentation.ts` | pending review |
| T0.5 | `lib/messages.ts`, `lib/messages.test.ts` | pending review |
| T4.1 | `scripts/probe-intercepta.ts` (not run yet: no key) | pending review |
| T4.2 | `lib/intercepta/client.ts`, `http.ts`, `schemas.ts`, `cache.ts`, `repo.ts`, `__fixtures__/memory-repo.ts`, `client.test.ts`, `client.live.test.ts`, `cache.test.ts`, `lib/db/schema.ts`, `drizzle/0001_screens_impersonation.sql` | pending review |
| T4.3 | `lib/intercepta/mapping.ts`, `mapping.test.ts` | pending review |
| T4.4 | failure policy in `lib/intercepta/http.ts`, `client.ts`, `lib/decision/matrix.ts`; tests in `client.test.ts`, `matrix.test.ts` | pending review |
| T4.5 | `lib/decision/types.ts`, `matrix.ts`, `lookalike.ts`, their tests, `lib/messages.ts` (`IMPERSONATION`) | pending review |
| T4.6 | `lib/decision/spam.ts`, `spam.test.ts` | pending review |
| T4.7 | `lib/decision/no-code.ts`, `no-code.test.ts` | pending review |
