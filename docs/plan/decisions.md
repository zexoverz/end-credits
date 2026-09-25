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

## E1

- **Ledger.** One line per tool call at most. A Bash install wins over Bash reads. Reads pulled out
  of Bash become `{t:"read", ps:[…]}` (up to 20 paths), only from segments whose command is a reader
  (`cat head tail less more grep egrep rg ag find fd ls tree sed awk wc bat file stat jq`), so
  `rm -rf node_modules/x` is not a read. Grep/Glob use `path`, then `pattern`.
- `start` keeps the first snapshot when a session resumes (SessionStart fires again on
  resume/clear/compact).
- **Settle.** The hook writes `<id>.end.json` (`endedAt`, `cwd`) and spawns a detached
  `endcredits settle --session <id>`, returning in ~90 ms. On success the child writes
  `<id>.done.json` and deletes the ledger, start and end files; a later retry reopens the same roll
  without uploading. On failure everything is kept and the error goes to `errors.log`. A session
  with no installed package used uploads nothing. The opened URL must be on the configured `apiUrl`
  origin, else `{apiUrl}/credits/<id>` is opened. `ENDCREDITS_NO_OPEN=1` skips the tab.
- **Timing.** The bundled `record` process, node boot included, takes ~36 ms on a 1 MB Write.
- **repoLabel** is the `name` in `cwd/package.json`, omitted when absent. Never a path.
- **Docs mapping.** A `homepage` on a shared host (github.com, gitlab.com, bitbucket.org,
  npmjs.com, unpkg.com, cdn.jsdelivr.net) is not a host match; a GitHub homepage counts as the repo
  URL. unpkg and jsdelivr also match `/<name>/…` and `/<name>`. An ambiguous match is sent as
  evidence `ambiguous <url>`. "Name in the path" checks the full name or the part after the scope.
- **dep_added** follows DESIGN §5 literally: `(end − start) ∪ add lines`, so an install command for a
  package already present still counts once. `import` sends no evidence (file hashes stay local).
- **session_key** = `keccak256` of the UTF-8 bytes of the `sessions.id` uuid string (viem
  `keccak256(stringToBytes(id))`).
- **POST /api/sessions** answers 201 when created, 200 with the same `{id, url}` on a re-upload.
  Idempotency is the `(owner_id, claude_session_id)` unique key with `ON CONFLICT DO NOTHING`, one
  path for retries and races. Errors are machine codes (`unauthorized`, `invalid_body`,
  `invalid_json`, `too_large`), not UI text. Body ≤ 2 MB; evidence ≤ cap entries of ≤ 512 chars.
- **GET /api/sessions/:id**: amounts via `formatUnits(micro, 6)` (`"0.25"`), payee `0x1234…5678`,
  404 for a non-uuid id. `credits` is empty until the settler writes them.
- CLI output lives in `CLI_MESSAGES` in `lib/messages.ts`, apart from the DESIGN §11 codes.
- `next dev` rewrites the repo `AGENTS.md` (Next 16 `agentRules`). Not changed here; revert it or
  set `agentRules: false` in `next.config.ts`.
