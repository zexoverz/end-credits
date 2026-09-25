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
| T1.2 | `cli/src/init.ts`, `cli/src/config.ts`, `cli/src/paths.ts`, `cli/src/args.ts`, `cli/src/index.ts`, their tests, `lib/messages.ts` (CLI strings) | pending review |
| T1.4 | `lib/attribution/specifier.ts`, `lib/attribution/specifier.test.ts` | pending review |
