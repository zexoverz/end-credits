# Decisions made during the build

Choices confirmed while building, each with its source. The plan in this folder is not edited.

## E0 (26 Sep)

- **Stack:** Next.js 16.3 App Router, pnpm 10 workspace (`.` and `cli/`), vitest, Drizzle 0.45 on
  postgres.js, Railway project `end-credits`, fixed domain `https://end-credits.up.railway.app`.
- **Amounts in the DB are micro-USDC `bigint` columns (`*_micro`)**, not `numeric` USDC, so the split
  and the chain use the same integers. bytes32 values (`session_key`, `package_key`, `tip_id`,
  hashes) are stored as `0x` hex text.
- `sessions.settle_requested_at` added: the settler picks up a session when this is set (on upload
  in `auto` mode, on **Roll credits** in `on_open` mode).
- **Env check:** the web boot checks `APP_URL`, `DATABASE_URL`, `SESSION_SECRET`; the worker boot
  checks everything it signs or screens with. Every other var throws the same
  `Missing required env: <NAME>` on first read. World vars join the boot check when
  `WORLD_REQUIRED=true`. Reason: callbacks need the deployed domain before MultiBaas, GitHub and
  World credentials exist.
- **Keys:** the deployer and faucet is the `ethglobal-tokyo` keystore
  (`0xfa064a16bDeD4C82aa6b3D4c656a640CeD547A13`). The server-held keys are fresh testnet keys made
  for this app, never exported from a keystore: payer `0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6`,
  recorder `0xc8e1Bc6B6c1AD5275935B313288b2c6FF45472A8`, receipt signer
  `0xCD5f2A9eB66463aea82a6E41E03D42b798cD6725`.
- **Payer USDC** came from a Uniswap v3 swap on Base Sepolia (WETH/USDC 0.3% pool
  `0x46880b404CD35c165EDdefF7421019F8dD25F4Ad`), tx
  `0x08751f72aa510e92fd09ad76945049bd6124b28bdb88ea75cd6765ec2c34d740`, 65.5 USDC. faucet.circle.com
  needs a captcha.

## CONFIRM: Claude Code hooks (T1.1)

Source: https://code.claude.com/docs/en/hooks and /docs/en/tools-reference, Claude Code 2.1.282.

- Events `SessionStart`, `PostToolUse`, `SessionEnd`; settings shape as in DESIGN §4.1. A matcher of
  only letters, digits, `_`, `-`, `,`, `|` is an exact-name list.
- stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name`; `SessionStart` adds `source`;
  `PostToolUse` adds `tool_name`, `tool_input`, `tool_response`, `tool_use_id` (file paths are
  absolute); `SessionEnd` adds `reason`.
- `tool_input`: Read `file_path`; Write `file_path`, `content`; Edit `file_path`, `new_string`;
  Grep/Glob `pattern`, `path?`; WebFetch `url`; Bash `command`. `MultiEdit` no longer exists (kept in
  the matcher, harmless).
- **On macOS and Linux, Glob and Grep are not in the default tool set; searches arrive as `Bash`
  calls.** `record` therefore also takes `node_modules/<pkg>` paths out of `Bash` commands.
- `SessionStart` stdout is added to Claude's context: `start` prints nothing.
- **`SessionEnd` has a 1.5 s default budget and its output is discarded.** `init` writes
  `"timeout": 15` on the SessionEnd handler; `settle` hands the upload and `open <url>` to a detached
  child so the hook returns at once. The opened tab is the user-visible signal.

## CONFIRM: x402 v2 (T5.1)

- Packages `@x402/core`, `@x402/evm`, `@x402/fetch` (and `@x402/next` if used) pinned `~2.27.0`
  (published 2026-09-22). `x402`, `x402-fetch`, `x402-next` are v1 and not used.
- Headers: `PAYMENT-REQUIRED` (base64 JSON challenge), `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`.
- Challenge: `{x402Version, resource:{url, description}, accepts:[{scheme, network, asset, amount,
  payTo, maxTimeoutSeconds, extra}]}`. `amount` is atomic units as a string. `extra` must be
  `{name:"USDC", version:"2"}` (verified on chain: domain separator matches
  `("USDC","2",84532,0x036C…CF7e)`).
- Facilitator `https://x402.org/facilitator`; `/supported` lists `exact` on `eip155:84532`.
- Pre-sign check: `x402Client.onBeforePaymentCreation` returns `{abort:true, reason}` before the
  signer runs. Default `spendControls` refuse payments over $1; set `maxAmountPerPayment: false`
  since our hook is the gate.

## CONFIRM: tea.yaml and FUNDING.json (T2.2)

- tea.yaml (zod, qs, Inquirer.js): `version`, `codeOwners` (list of quoted address strings, may
  carry YAML comments), `quorum`. Parsed with `yaml`, not a regex.
- FUNDING.json (prettier, TanStack/query, vitest): `{"drips":{"ethereum":{"ownedBy":"0x…"}}}`. Drips
  also reads other network keys (`filecoin`, `optimism`, …); we read `ethereum` first, then any other
  `drips.*.ownedBy`.

## E4 (26 Sep)

### Intercepta API, confirmed from the OpenAPI docs

Index `https://docs.web3antivirus.io/llms.txt`; each reference page + `.md` holds its OpenAPI JSON.
Base `https://api.web3antivirus.io`, header `X-API-KEY`.

- Quick scan: `GET /api/public/v2/extension/account/{address}/quick-scan`
  (`/reference/quick-scan-address.md`). `/toxic-score` (`/reference/scan-address.md`, "Deep Scan")
  returns the same `ToxicScoreShortResponseV2`: `{toxicScore: number, traits: [{name, risk,
  txsCount, description}]}`. No `chainId`. Trait names include `sanction_address`, `known_scammer`,
  `blacklist`, `fake_phishing_transfer`, `mixer_transfers`, `sanction_address_communication`,
  `rug_pull` and others; we parse `name` as a free string.
- Token risks: `GET /api/public/v2/extension/token-intelligence/token/{address}/risks?chainId=8453`
  (`/reference/scan-token.md`). `{apiVersion, riskScore, riskLevel: neutral|low|medium|high,
  category, trust: whitelist|blocklist|neutral, action: block|warn|info, detectors: [{code,
  description}], token: {chainId, address, symbol}, saleTax, buyTax}`.
- Simulation: `POST /api/public/v1/extension/simulation/transaction?chainId=8453`
  (`/reference/scan-transaction.md`), chains `1, 56, 8453, 42161, 10, solana`. Body
  `{transaction: {from, to, value, data, gas?, gasPrice?}, mode: "short"}`. Response
  `{to, from, detectors: [{code, description}], assetsMovement: {send, receive}, transactionType}`.
  We simulate `USDC.transfer(payee, amount)` on Base USDC from the payer.
- **Impersonation (the SPEC §7.1 CONFIRM): there is a dedicated endpoint.**
  `GET /api/public/v1/extension/poisoning-attack/check-address/{address}`
  (`/reference/detect-address-impersonation.md`) → `{isAddressPoisoned: boolean, originalAddress}`.
  Its sibling `/poisoning-attack/user/{address}` lists attacks *against* a wallet and is not used.

### Choices

- `screenPayee` runs quick scan, impersonation and token risks in parallel (token risks hit the 1 h
  cache after the first payee). Simulation runs only when quick scan fails. Any of the three still
  failing sets `Screen.error`, so the matrix holds. A payee therefore costs 2 requests, not 1.
- A positive impersonation check refuses at rule 4 with a new message code `IMPERSONATION`
  (`Refused. Intercepta: this address impersonates {original} (address poisoning).`), so
  `MESSAGES` has 39 codes. Our own lookalike rule still runs after it, labelled as ours.
- New `screens.kind` value `impersonation` (migration `0001_screens_impersonation`).
- Simulation fallback: its detectors become `Screen.traits` (name = detector code, description
  verbatim), toxic score 0. `CRITICAL` also holds `SCAM_ADDRESS`, `MALICIOUS_ADDRESS`,
  `TRANSFER_TO_POISONING_ADDRESS`, `POISONING_ATTACK` so a scam recipient found this way is refused.
- Failure mapping: deadline hit → `TIMEOUT` (the deadline races the fetch, so a fetch that ignores
  its signal still times out); non-2xx or network error → `HTTP`; bad JSON or a body that fails
  the schema → `PARSE`. Every call, failed or not, is a `screens` row (status 0 when there was no
  HTTP answer). Only status-200 rows that pass the schema again are reused from the cache.
- `DecideInput` gains `pkg` (the message texts need `{package}`); `Screen` gains `impersonation` and
  `screenIds` (for `credits.screen_ids`). Reason sources: `intercepta`, `policy`, `payee` as in
  DESIGN §3. `SCREENED_AS` is appended to every decision made on a successful screen.
- Held on token `warn` uses `HELD_MEDIUM` with the address score, which may read `(0)`. Left as is.
- Spam: an unknown download count is not treated as low.
- `noCodeOnBase` reads `getCode` on `ETH_MAINNET_RPC` / `BASE_MAINNET_RPC` (defaults
  `https://ethereum-rpc.publicnode.com`, `https://mainnet.base.org`). An RPC error throws rather
  than returning false. An EIP-7702 delegation (`0xef0100…`) counts as an EOA. Live fixtures,
  checked with `eth_getCode` on 26 Sep: DAI `0x6B175474E89094C44Da98b954EedeAC495271d0F` is on
  Ethereum only; Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` is on both.
- T4.1 probe: `~/.config/dominion/intercepta-key` did not exist on 26 Sep, so
  `scripts/probe-intercepta.ts` is written (10 requests) but not run, and
  `docs/intercepta-probe.md` does not exist yet.
