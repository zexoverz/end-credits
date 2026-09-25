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

## E5

- **Manual resource route, no `withX402`.** `app/api/x402/credit/[creditId]` calls
  `handleCreditRequest` (`lib/x402/server.ts`), which builds the v2 challenge itself and calls the
  facilitator's `verify` then `settle` directly (`HTTPFacilitatorClient`). This lets the 409 run
  before any quote and gives the handler the settle tx hash to sign and store the receipt.
  `@x402/next` and `@x402/paywall` are not installed.
- **Order in the handler:** unknown credit → 404; already settled (`tx_hash` and `receipt` set) →
  the stored receipt, 200, before the freshness check, so a receipt stays readable after its screen
  ages out; outcome not `paid`/`capped`, or no `status 200` `address` screen of the payee (matched
  case-insensitively) within 10 min → 409 `NOT_PAYABLE`; no `PAYMENT-SIGNATURE` → 402.
- **The server re-checks the payment against the credit** (`accepted` scheme, network, asset,
  payTo, amount, and the signed authorization's `to` and `value`) before it calls the facilitator,
  and passes its own requirements, not the client's copy, to `verify` and `settle`. Failures come
  back as a 402 whose `error` is `CHALLENGE_MISMATCH`, `INVALID_PAYMENT` or the facilitator's reason.
- **Challenge differs from DESIGN §10 as the x402 v2 CONFIRM says:** `resource` is the top-level
  `{url, description}`; each accept carries `maxTimeoutSeconds: 120` and
  `extra: {name:"USDC", version:"2"}`. `resource.url` is built from `APP_URL`, not `req.url`.
- **Receipt:** `{creditId, package, amount, payee, tx}`, `amount` in micro-USDC as a string, signed
  with `RECEIPT_SIGNING_KEY` by `signMessage` over the JSON with sorted keys; `sig` and `signer`
  added. The client checks the signature, `creditId`, `payee` and that `tx` equals the
  `PAYMENT-RESPONSE` transaction.
- **Client spend controls are off (`setSpendControls(false)`), not `{maxAmountPerPayment:false}`.**
  With an object, the library's default-asset allowlist rejects a wrong token before our hook runs,
  so the refusal would be a library error instead of `TOKEN_PIN`. Our `onBeforePaymentCreation` hook
  is the gate. Only `eip155:84532` is registered; a challenge on another network fails selection
  and is mapped to `CHALLENGE_MISMATCH`, and the hook checks the network too.
- **Extra client checks beyond DESIGN §10:** `extra` must be `{name:"USDC", version:"2"}` with no
  `assetTransferMethod` other than `eip3009`, and `maxTimeoutSeconds` must be 1 to 120; else
  `CHALLENGE_MISMATCH`.
- **New message `NOT_PAYABLE`** ("Not paid: this credit has no fresh paid decision to pay
  against."): the 409 body and the client refusal when `decisionAllowsPay` is false.
- **Smoke run (26 Sep):** `scripts/x402-smoke.ts` paid 0.01 USDC from the payer to
  `0xfa064a16bDeD4C82aa6b3D4c656a640CeD547A13` through `https://x402.org/facilitator`, tx
  `0x41558f81e02bab8ae2300a64a588d381facf0a6d90dbba7069747b16839e5df1`, block 47293505, status 1,
  `AuthorizationUsed` and a `Transfer` of 10000 in the receipt. `balanceOf` read right after the
  receipt returned the pre-transfer value from `sepolia.base.org`, so the script now reads the
  `Transfer` log instead.
