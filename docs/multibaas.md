# Curvegrid MultiBaas in End Credits

## Curvegrid MultiBaas

**Summary.** End Credits is an AI agent that pays the open-source packages a Claude Code session
used, and MultiBaas deploys and indexes its escrow so that saved event queries and one webhook are the
whole backend of its money dashboard and of the owner's "money is held" notification.

### How MultiBaas is used

| Use | Where |
|---|---|
| Deploy through the MultiBaas Forge plugin (`curvegrid/forge-multibaas`), linked as label `endcredits_escrow`, alias `escrow` | [`contracts/script/Deploy.s.sol`](../contracts/script/Deploy.s.sol) |
| Deploy `EndCreditsBudget` the same way, linked as label `endcredits_budget`, alias `budget` | [`contracts/script/DeployBudget.s.sol`](../contracts/script/DeployBudget.s.sol) |
| Link Base Sepolia USDC (a contract we did not deploy) as `usdc` with the ERC-20 ABI, so the payer's x402 `Transfer`s are indexed next to the escrow events | [`scripts/multibaas-setup.ts`](../scripts/multibaas-setup.ts) |
| Six saved event queries: `paid_totals`, `held_status`, `reserved_by_package`, `reserved_sessions`, `sessions`, `recent` | [`lib/multibaas/queries.ts`](../lib/multibaas/queries.ts) |
| `/api/dashboard` builds every amount and count from those queries (60 s cache) | [`lib/multibaas/dashboard.ts`](../lib/multibaas/dashboard.ts), [`app/api/dashboard/route.ts`](../app/api/dashboard/route.ts) |
| Actions and a 48 h timeline, built from the same query rows | [`lib/multibaas/actions.ts`](../lib/multibaas/actions.ts) |
| Webhook `endcredits` on `event.emitted`: HMAC over the exact body bytes, 300 s skew, de-dup by `txHash:logIndex`; a `Held` event notifies the owner of that payer | [`lib/multibaas/webhook.ts`](../lib/multibaas/webhook.ts), [`app/api/webhooks/multibaas/route.ts`](../app/api/webhooks/multibaas/route.ts) |
| REST client: bearer auth, envelope unwrap, 8 s deadline, typed errors | [`lib/multibaas/client.ts`](../lib/multibaas/client.ts), [`lib/multibaas/rows.ts`](../lib/multibaas/rows.ts) |

### The AI agent (Best AI Agent Project)

- **Claude Code is the working agent.** The `endcredits` hooks record what it used, with no code and
  no repo paths ([`cli/src/record.ts`](../cli/src/record.ts)).
- **It can ask for its own settlement.** `endcredits init` registers the End Credits MCP server
  (`endcredits mcp`, [`cli/src/mcp.ts`](../cli/src/mcp.ts), [`cli/src/mcp-tools.ts`](../cli/src/mcp-tools.ts))
  in `.mcp.json`. Three tools: `end_credits_status` (what this session used and the estimated
  split), `end_credits_roll` (upload the session and request settlement), `end_credits_explain`
  (each package's outcome with its stored reason, Basescan links, and approve links for held money).
- **The settler is the autonomous paying agent.** It resolves payees, screens them with Intercepta,
  decides, and pays over x402 or writes to the escrow, with no human in the loop except for held
  money ([`lib/settle/settle.ts`](../lib/settle/settle.ts), run by `pnpm worker`).
- **The LLM never decides who gets paid.** The MCP tools read and request; the payee, the screen and
  the matrix decide. Every tool description says so.

### The dashboard (Best Digital Asset Dashboard)

`/dashboard` (https://end-credits.up.railway.app/dashboard) shows USDC paid to maintainers, held
money split into pending, approved, denied and expired, reserved USDC per package, a per-package
table, the session count, and recent escrow and USDC events with Basescan links. Every amount comes from the MultiBaas event queries above
([`lib/multibaas/dashboard.ts`](../lib/multibaas/dashboard.ts)); only package names come from our
database. Refused credits are a count from our decision log, since refused money never moves. The
webhook turns each `Held` event into an owner notification.

It also says what to do next. Above the cards is a list of actions: held tips waiting for the owner's
signature (a `Held` with no `Released` or `Refunded` yet, soonest expiry first, flagged when under
2 h), then reserves waiting for a maintainer to claim, largest first. Each links to the page where it
is done. Below the cards, a 48 h chart per UTC hour of paid, held, released, refunded, reserved and
claimed USDC, from the same MultiBaas events.

### Team

Faisal, solo. GitHub [`zexoverz`](https://github.com/zexoverz).

### Setup and testing (MultiBaas part)

1. Create a MultiBaas deployment on Base Sepolia and an API key in the admin group.
2. Deploy and link the escrow (the plugin needs `python3`):
   ```sh
   cd contracts
   USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
   RECORDER_ADDRESS=<recorder> CHANGE_DELAY=259200 \
   MULTIBAAS_URL=<deployment url> MULTIBAAS_API_KEY=<key> \
   forge script script/Deploy.s.sol --rpc-url <base sepolia rpc> --account <keystore> --broadcast --ffi
   ```
   Read the log for `Link Contract: Error` (see below). To re-link after a failed broadcast, set
   `MULTIBAAS_ALLOW_UPDATE_ADDRESS=true`.
3. With `MULTIBAAS_URL`, `MULTIBAAS_API_KEY`, `APP_URL`, `ESCROW_ADDRESS` and `PAYER_ADDRESS` set,
   `pnpm tsx scripts/multibaas-setup.ts` links USDC, saves the six queries, creates the webhook,
   writes its secret to a local file (mode 600) and runs each query once. It is idempotent.
4. Set `MULTIBAAS_URL`, `MULTIBAAS_API_KEY` and `MULTIBAAS_WEBHOOK_SECRET` on the app and open
   `/dashboard`.
5. `pnpm test lib/multibaas` covers query shapes, row parsing, dashboard math, and the webhook's
   signature, skew and de-dup.

### Experience with MultiBaas

- **Win:** the Forge plugin deployed and linked the escrow (and later the budget contract) in one
  `forge script` run each, and saved
  queries plus one webhook gave us the dashboard backend without writing an indexer. Linking USDC,
  a contract we did not deploy, put the x402 payments on the same dashboard as the escrow events.
- **Address filters are case-sensitive.** `paid_totals` returned 0 transfers although the x402
  payments were indexed: MultiBaas stores event address inputs lowercase and compares filter values
  as strings, so the checksummed payer matched nothing. Filtering on the lowercase address fixed it
  ([`lib/multibaas/queries.ts#L101`](../lib/multibaas/queries.ts#L101)).
- **Linking needs bytecode.** The API rejects a contract without it, even when only linking an
  existing address; we upload the ERC-20 ABI with `bin: "0x"`.
- **`PUT /queries/{label}` answers without `result`,** unlike reads, so an envelope check that
  requires `result` fails on a successful write.
- **`limit` is capped at 50;** a larger value is a 400 "invalid request". We page 50 at a time.
- **bytes32 values in saved-query results come back as a byte-array string** (`"[193, 60, …]"`),
  not hex. [`lib/multibaas/rows.ts`](../lib/multibaas/rows.ts) parses both.
- **No per-event webhook filter.** `event.emitted` delivers every event of every linked contract, so
  with USDC linked most deliveries are unrelated USDC transfers. We drop them after the signature
  check, before any database call.
- **No count aggregator.** Every count is taken from rows, which is why there is a separate
  `reserved_sessions` query.
- **The Forge plugin hides link failures and links before broadcast.** A bad URL logs
  `Link Contract: Error during validation` and the script still exits 0. The link also runs during
  simulation, so a broadcast that fails afterwards leaves a MultiBaas address with no contract.
