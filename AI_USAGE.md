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
| T5.2 | `lib/x402/constants.ts`, `lib/x402/receipt.ts`, `lib/x402/receipt.test.ts`, `lib/x402/server.ts`, `lib/x402/server.test.ts`, `lib/x402/repo.ts`, `lib/x402/deps.ts`, `app/api/x402/credit/[creditId]/route.ts`, `lib/messages.ts` (`NOT_PAYABLE`), `lib/messages.test.ts` | pending review |
| T5.3 | `lib/x402/client.ts`, `lib/x402/client.test.ts`, `scripts/x402-smoke.ts`; the smoke payment on Base Sepolia was run by the agent | pending review |
