# Decisions made during the build

Choices confirmed while building, each with its source. The plan in this folder is not edited.

## T6.1 `EndCreditsEscrow`

- Pinned deps: OpenZeppelin `v5.7.0`, forge-std `v1.16.2`, as submodules under `contracts/lib/`.
  solc `0.8.28`, optimizer 200 runs, `evm_version = cancun`, default metadata hash for Sourcify.
- `hold` checks in this order: `TipExists`, `ZeroAmount`, `ZeroPayee`, `TtlOutOfRange`. TTL bounds
  are inclusive (`MIN_TTL` and `MAX_TTL` are both accepted).
- `amount` is stored as `uint128`; anything larger reverts with OZ `SafeCastOverflowedUintDowncast`
  rather than a new custom error. USDC amounts never get near it.
- Expiry boundary: at `block.timestamp == expiresAt` the tip is expired. `release` reverts
  `TipExpired`, and anyone may `refund`. `Refunded.expired` is `block.timestamp >= expiresAt` for
  every caller, so a recorder deny after expiry also reports `expired == true`.
- `setClaim` to the same payee is not a change. Once `changed` is set it stays set; the delay runs
  from the latest change (`changedAt`).
- `claim` checks `NoClaim`, then `ClaimCoolingDown`, then `NothingReserved`.
- Events are emitted before the token transfer; all state is written before any external call.
- Added views `tipOf(bytes32)` (returns the `Tip` struct) and `claimOf(bytes32)` (returns the
  payee) for the backend.
- No zero-address checks in the constructor, to keep the interface as in DESIGN §16;
  `script/Deploy.s.sol` refuses zero `USDC_ADDRESS` or `RECORDER_ADDRESS`.
- The balance invariant is strict equality for flows through the contract. USDC sent straight to
  the escrow address (not through `hold` or `reserve`) would make the balance exceed the totals and
  is stuck; nothing reads the balance, so this is left as is.

## T6.2 mutation pass

Each row: the guard deleted (or the value swapped) in `contracts/src/EndCreditsEscrow.sol`, then
`forge test`, then the source restored. Every guard makes its named DESIGN §16.1 test fail; no row
is empty. Run on 2026-09-26 against the T6.1 contract; `git diff` on `src/` was clean afterwards.

| Guard removed or changed | Tests that fail |
|---|---|
| hold: `TipExists` | `test_hold_revertsOnDuplicateTip` |
| hold: `ZeroAmount` | `test_hold_revertsOnZeroAmount` |
| hold: `ZeroPayee` | `test_hold_revertsOnZeroPayee` |
| hold: `TtlOutOfRange` (whole check) | `test_hold_revertsOnTtlOutOfRange` |
| hold: `TtlOutOfRange` (MIN side only) | `test_hold_revertsOnTtlOutOfRange` |
| hold: `TtlOutOfRange` (MAX side only) | `test_hold_revertsOnTtlOutOfRange` |
| release: `onlyRecorder` | `test_release_revertsForNonRecorder` |
| release: `NotPending` | `test_release_revertsTwice`, `test_release_revertsAfterRefund`, `test_release_revertsForUnknownTip` |
| release: `TipExpired` | `test_release_revertsAfterExpiry` |
| release: pays stored payee (swapped to `msg.sender`) | `test_release_paysFixedPayee`, `test_release_succeedsJustBeforeExpiry` |
| release: `totalPending` decrement | `invariant_balanceEqualsPendingPlusReserved`, `invariant_totalsMatchGhosts`, `test_release_paysFixedPayee` |
| refund: `NotPending` | `test_refund_revertsTwice`, `test_refund_revertsAfterRelease` |
| refund: `NotExpired` | `test_refund_revertsForStrangerBeforeExpiry` |
| refund: pays payer (swapped to `msg.sender`) | `test_refund_byAnyoneAfterExpiry`, `test_refund_byRecorderBeforeExpiry` |
| refund: `expired` flag (swapped to `false`) | `test_refund_byAnyoneAfterExpiry` |
| reserve: `ZeroAmount` | `test_reserve_revertsOnZeroAmount` |
| setClaim: `onlyRecorder` | `test_setClaim_revertsForNonRecorder` |
| setClaim: `ZeroPayee` | `test_setClaim_revertsOnZeroPayee` |
| setClaim: first set is not a change | `test_claim_firstSetClaimHasNoDelay`, `test_setClaim_samePayeeIsNotAChange` |
| setClaim: same payee is not a change | `test_setClaim_samePayeeIsNotAChange` |
| claim: `NoClaim` | `test_claim_revertsWithoutClaim` |
| claim: `ClaimCoolingDown` | `test_claim_revertsDuringCoolingAfterChange` |
| claim: `NothingReserved` | `test_claim_revertsWhenNothingReserved`, `test_claim_revertsAfterReserveDrained` |
| claim: zero the reserve before transfer | `test_claim_paysClaimedPayeeAndZeroes`, `test_claim_revertsAfterReserveDrained`, `test_claim_succeedsAfterCooling` |
| recordSession: `onlyRecorder` | `test_recordSession_revertsForNonRecorder` |

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
## E4 (26 Sep)
## E6 chain

- **MultiBaas link:** `curvegrid/forge-multibaas` pinned at `8e84d1ca7db1240dcf7c1646d26c4fbcbb95a54d`
  (24 Mar 2025, the latest commit), remapped `forge-multibaas/=lib/forge-multibaas/src/`. `ffi` is
  not in `foundry.toml`; the deploy passes `--ffi` on the command line.
- `Deploy.s.sol` links only when `MULTIBAAS_URL` is set **and** the run is a broadcast
  (`vm.isContext(ScriptBroadcast)`), so a dry run never links an address that was not sent. Label
  `endcredits_escrow`, alias `escrow`, version `1.0`, starting block `-100`.
- **The plugin swallows link errors:** with a bad URL the script logs
  `Link Contract: Error during validation: ...` and still exits 0 (tested on anvil). The deploy log
  has to be read for that line. The link also runs during simulation, before the tx is sent, so a
  failed broadcast after a good link leaves a MultiBaas address with no contract; re-run with
  `MULTIBAAS_ALLOW_UPDATE_ADDRESS=true`.
- **Tx queue:** every write is simulated first (inside the queue, after the previous tx from that
  key is mined), so a revert is named from the custom error before anything is signed. Nonce comes
  from `getTransactionCount(blockTag: "pending")`; one retry on `nonce too low` with a fresh nonce.
  If a mined tx reverts anyway, the call is replayed at `blockNumber - 1` to name the error, else
  `unknown`. Errors are `TxRevertedError` with `errorName`.
- `refund` and `claim` are sent from the recorder key (DESIGN §2), though the contract lets anyone
  call them after expiry / always.
- Receipt polling is 1 s by default (Base Sepolia blocks are 2 s; viem's default is 4 s).
- The integration test (`lib/chain/escrow.anvil.test.ts`) uses anvil on `:8546`, starting one if
  none is running, and skips when anvil or `contracts/out` is missing. It stands in for the live
  Base Sepolia test until the escrow is deployed.
- `origin/e0-foundation` had committed a gitlink for `.claude/worktrees/agent-a44bbe6f…`, which
  broke `git submodule update`; removed on this branch.
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
## E8 backend

- **Owner auth (`lib/auth/owner.ts`).** iron-session cookie `ec_owner` = `{ownerId}`, password
  `SESSION_SECRET`, 7-day ttl, `httpOnly`, `sameSite=lax`, `secure` in production. Handlers read
  and write it through iron-session's `webCookies(req, headers)`, so they run in tests without a
  Next request scope; `getOwnerSession()` / `requireOwner()` with no argument read Next's
  `cookies()`. `requireOwner` also checks the owner row still exists.
- **Dev login.** `OWNER_DEV_TOKEN` is compared as `timingSafeEqual(sha256(a), sha256(b))`, so length
  does not leak. Both the cookie login and the dev bearer bind to the first owner row
  (`created_at`, then `id`) and are off when `WORLD_REQUIRED=true` (login answers 403). No rate
  limit on `/api/auth/dev`; the token is 32+ random bytes.
- **One release per tip.** Approve and deny lock the hold row (`FOR UPDATE OF holds`) for the whole
  call, chain tx included. A second click waits, then sees the hold resolved and gets 409. A chain
  error rolls the transaction back (hold stays `pending`, credit stays `held`) and answers 502 with
  the custom error name; approve then writes a `failed` approval row with that code.
- Checks in order: owner (401), `WORLD_REQUIRED` for session approve (403), tip id shape and the
  hold belonging to this owner (404, so a tip id of someone else's hold is not confirmed), status
  `pending` (409), not expired (410). **Deny after expiry is also 410**: the expirer refunds it and
  appends `EXPIRED`.
- The session approval row is written once, `status 'approved'`, after the release is mined, with
  `nonce` = 32 random bytes and `approvalRef = keccak256(nonce)` sent to `release`.
- Owner decisions are appended to `credits.reasons` with `source: "owner"` (a fourth source next to
  `intercepta`, `policy`, `payee`). Approve sets `outcome 'paid'`, `tx_hash` = release tx,
  `settled_at`; deny keeps `outcome 'held'` and the hold tx in `tx_hash`, and the refund tx goes to
  `holds.refund_tx`.
- **`GET /api/approve/:tipId` is public**, like the roll: the package, amount and reason are on the
  roll already; it adds the full payee (what is being approved) and whether the viewer is signed in
  and is the owner. `status` is `expired` once `expires_at` passes, before the expirer runs.
- **`GET /api/history` is public**, payees shortened as on the roll, every decided credit
  (`decided_at` set) newest first, 200 max. `txUrl` is a Basescan link only for a 32-byte hash.
- **Settings bounds:** budget and cap 0.01 to 100 USDC, daily limit 0.01 to 1000, at most 6
  decimals, strings only; hold TTL 60 s to 7 days (the escrow's `MIN_TTL`/`MAX_TTL`); the cap may
  not exceed the session budget (checked against the stored row under a lock).
- **Payer balance:** read with a 5 s timeout; any failure is `error: "rpc_unavailable"`, never the
  RPC message, which can carry the provider URL.
- **Agent keys:** `ec_` + 32 random bytes base64url, shown once; `agent_keys.token_hash` is its
  sha256 hex (the hash `POST /api/sessions` checks). `bound_via 'dev'`. Revoking someone else's key
  is 404; revoking twice keeps the first time.

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
## E2 and E3 (26 Sep)

- **Registry:** `repository` is read from the requested version (default `latest`), falling back to
  the top-level doc; `funding` the same. Repo names are lowercased, as in `measure-funding.py`.
  Funding links keep only `github.com/sponsors/*` and `opencollective.com/*`. In-memory 1 h cache
  keyed by `name@version`.
- **Addresses:** a mixed-case address with a wrong EIP-55 checksum, and the zero address, are
  `PAYEE_INVALID` (strict viem `isAddress`, then `getAddress`). A typo is not a payee.
- **Invalid falls through:** an invalid address in `FUNDING.json` does not stop resolution; tea and
  npm funding are still tried. `PAYEE_INVALID` is returned only when nothing valid is found.
- **GitHub errors:** a raw-file 404 is "no file"; any other status throws so the caller retries,
  rather than reading an outage as "no payee".
- **Claim observation** `source_url` is `claim:<packageKey>`.
- **Anti-spoof (T2.5):** checked after the claim and before the repo files. Mismatch, missing
  `package.json`, or unparsable JSON → no payee, `SPOOF_REPO`, and npm funding is not tried either.
  Exception: a root `package.json` with `"private": true` and no `repository.directory` is a workspace
  root and passes unchecked. Without it `zod` (root has no name) and `date-fns` (root is
  `@date-fns/root`) would both be reserved as spoofs. A claim is not subject to the check.
- **Change window:** `days` counts from the first observation of the new address after the last
  observation of the old one.

### CONFIRM: GitHub Activity API (T2.6)

Checked with `gh api` on 26 Sep. `GET /repos/{o}/{r}/activity?ref=<branch>` returns
`{before, after, ref, timestamp, activity_type, actor}` per push, newest first, cursor-paginated via
the `Link` header; `activity_type` is one of `push`, `force_push`, `pr_merge`, `branch_creation`,
`branch_deletion`, … Works unauthenticated (60/h). History reaches back to at least March 2023
(prettier, qs). It has no path filter.

- `ljharb/qs` `tea.yaml`: commit `c4d29f35ac`, commit date `2024-03-19T19:51:35Z`; the activity entry
  with `after = c4d29f35ac` is a `force_push` at `2024-03-19T23:39:26Z`. The server time differs from
  the commit date, which is the point.
- `prettier/prettier` `FUNDING.json`: commit `d498b6f2a5`, a `pr_merge` at `2024-04-04T13:55:00Z`.

`firstSeenPush(repo, path, {since})` (`lib/payee/push.ts`): the commits API gives only the SHA of the
last commit touching the file on the default branch (its dates are never read); the Activity API is
paged back to `since`; the push whose `after` is that SHA wins, else up to 10 pushes are checked with
the compare API for the SHA inside a multi-commit push. Not found inside the window → `null`.

`recentlyChanged` calls it only when no different address is in the window and our first observation
of the package is younger than 30 days (so "never observed" included). Push inside 30 days →
changed, `days` from the push. Two consequences:
- the last commit touching the file may be a formatting change, which then reads as a change; the
  cost is a hold, not a payment.
- a fixture repo created this week with a `FUNDING.json` holds on first sight. Fine for
  `moved-payout` (held anyway) and `left-padder-pro` (refused first).

### Split (T3.1)

- The over-cap test is exact (`remaining × score > cap × total`), not on the floored share, so the
  result equals continuous water-filling floored once; that is what makes the monotonic property
  hold exactly.
- A capped amount under the dust floor (cap < 0.01) is `dust`, not `capped`. Dust is not
  redistributed. Zero scores are left out of the result. Non-integer scores and negative money throw.
- Guard checks, done by hand: replacing the over-cap filter with `[]` fails "never pays more than
  the cap" and the two cap cases; replacing `amount < DUST_FLOOR` with `false` fails "never sends a
  nonzero amount under the dust floor" and the two dust cases. Removing the 30-day window in
  `recentlyChanged` fails "last seen over 30 days ago is not a change".

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

- **MultiBaas link:** `curvegrid/forge-multibaas` pinned at `8e84d1ca7db1240dcf7c1646d26c4fbcbb95a54d`
  (24 Mar 2025, the latest commit), remapped `forge-multibaas/=lib/forge-multibaas/src/`. `ffi` is
  not in `foundry.toml`; the deploy passes `--ffi` on the command line.
- `Deploy.s.sol` links only when `MULTIBAAS_URL` is set **and** the run is a broadcast
  (`vm.isContext(ScriptBroadcast)`), so a dry run never links an address that was not sent. Label
  `endcredits_escrow`, alias `escrow`, version `1.0`, starting block `-100`.
- **The plugin swallows link errors:** with a bad URL the script logs
  `Link Contract: Error during validation: ...` and still exits 0 (tested on anvil). The deploy log
  has to be read for that line. The link also runs during simulation, before the tx is sent, so a
  failed broadcast after a good link leaves a MultiBaas address with no contract; re-run with
  `MULTIBAAS_ALLOW_UPDATE_ADDRESS=true`.
- **Tx queue:** every write is simulated first (inside the queue, after the previous tx from that
  key is mined), so a revert is named from the custom error before anything is signed. Nonce comes
  from `getTransactionCount(blockTag: "pending")`; one retry on `nonce too low` with a fresh nonce.
  If a mined tx reverts anyway, the call is replayed at `blockNumber - 1` to name the error, else
  `unknown`. Errors are `TxRevertedError` with `errorName`.
- `refund` and `claim` are sent from the recorder key (DESIGN §2), though the contract lets anyone
  call them after expiry / always.
- Receipt polling is 1 s by default (Base Sepolia blocks are 2 s; viem's default is 4 s).
- The integration test (`lib/chain/escrow.anvil.test.ts`) uses anvil on `:8546`, starting one if
  none is running, and skips when anvil or `contracts/out` is missing. It stands in for the live
  Base Sepolia test until the escrow is deployed.
- `origin/e0-foundation` had committed a gitlink for `.claude/worktrees/agent-a44bbe6f…`, which
  broke `git submodule update`; removed on this branch.

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
## E7

- **Layout.** The orchestration is `lib/settle/` (`settle.ts`, `store.ts`, `run.ts`, `expire.ts`,
  production wiring in `deps.ts`); `worker/settler.ts` and `worker/expirer.ts` are thin loops.
  Every outside call is a dependency, so `settle.test.ts` runs on Postgres with fakes and
  `settle.anvil.test.ts` runs the real escrow calls on anvil `:8547`.
- **Claim:** one `update … where id = (select … for update skip locked limit 1) returning id`,
  oldest `settle_requested_at` first.
- **Daily limit:** "today" is the UTC calendar day of `credits.decided_at`; spent is the sum of
  `amount_micro` over the owner's credits with outcome `paid`, `capped`, `held` or `reserved`,
  executed or not (a failed execution still counts, so a retry can never exceed the limit).
  B ≤ 0 → every credit `dust` with `DAILY_LIMIT`, session `settled`, no `recordSession` (as in the
  §7 pseudo-code).
- **Scores** are recomputed from `usage` with the §5 weights and caps (`lib/settle/scores.ts`); the
  CLI's caps are not trusted. Roles as in §5: top 3 starring, else the lead signal.
- **Two phases.** Phase 1 (concurrency 3): registry, payee, change detection, `noCodeOnBase` for
  every non-dust credit. Phase 2 (concurrency 3, amount desc): screen, decide, store, execute. The
  split is needed because the spam rule counts payees across the whole session.
- **Rows first.** All credits are inserted with outcome null before any lookup, so the roll lists
  every package at once. Dust shares get `dust` + `DUST` at insert and are never resolved. `tip_id`
  is set on every row at insert.
- **Lookup failure** (registry, GitHub, claim read, push time, or mainnet RPC throwing twice) →
  `refused` with a new `RESOLVE_FAILED` reason. Held needs a payee and reserved means "no wallet",
  so neither fits; refusing keeps the money with the owner.
- **Screen that throws** (e.g. the `screens` insert fails) → a screen with `error: "HTTP"` → held.
- **Lookalike** compares against every payee observed for any other package (claims included, as
  claims are observations too), read from `payee_observations`.
- **Change detection** passes GitHub push times only for `drips` (`FUNDING.json`) and `tea`
  (`tea.yaml`) payees.
- **Execution failure keeps the decision.** The outcome stays; `tx_hash` stays null; a reason is
  appended: the x402 refusal code when the client refused (`PAYTO_MISMATCH`, `NOT_PAYABLE`, …),
  else a new `EXECUTION_FAILED` with the error's name only (messages can carry RPC URLs). A paid
  credit that already has a `tx_hash` is never paid again.
- **recordSession totals** count only executed amounts for paid (paid + capped), held and reserved;
  refused counts decided amounts. The manifest is the credits (package, amount as a micro-USDC
  string, outcome, payee, tx) sorted by package, canonical JSON with sorted keys, keccak256.
  `ownerHash` = `owners.sub_hash`, else `keccak256(utf8(owner.id))`. A `recordSession` failure
  marks the session `failed` (credits already executed stay executed).
- **Holds row** `expires_at` = the time the `hold` tx returned + `hold_ttl_seconds`, so it is at or
  after the chain's `expiresAt` (block time + TTL) and the expirer does not refund early.
- **Expirer:** every 30 s, `pending` holds with `expires_at < now` → `refund(tipId)` from the
  recorder → `expired`, `refund_tx`, `resolved_at`, and `EXPIRED` appended to the credit. A failed
  refund leaves the hold pending for the next tick.
- **`POST /api/sessions/:id/settle`:** 404 unknown id, 401 no owner, 403 another owner's session,
  409 unless `status = 'uploaded'` and `settle_requested_at` is null (one conditional update, so two
  presses race safely), else 202. The owner comes from the `ec_owner` iron-session cookie
  (`{ownerId}`, password `SESSION_SECRET`, `lib/auth/owner.ts`), or from
  `Authorization: Bearer <OWNER_DEV_TOKEN>` (constant-time compare) while `WORLD_REQUIRED` is not
  `true`. `getOwnerSession(req)` reads through `webCookies(req)`; without a request it uses Next's
  `cookies()`.
- **Seed:** owner matched by `display_name`; the agent key is created only with `--write-config`,
  and skipped when `~/.endcredits/config.json` already holds a live key of that owner. The token is
  never printed. Approval runs when `ESCROW_ADDRESS` is set and the allowance is under 1000 USDC.
- **New messages:** `RESOLVE_FAILED`, `EXECUTION_FAILED` (43 codes).

- **MultiBaas link:** `curvegrid/forge-multibaas` pinned at `8e84d1ca7db1240dcf7c1646d26c4fbcbb95a54d`
  (24 Mar 2025, the latest commit), remapped `forge-multibaas/=lib/forge-multibaas/src/`. `ffi` is
  not in `foundry.toml`; the deploy passes `--ffi` on the command line.
- `Deploy.s.sol` links only when `MULTIBAAS_URL` is set **and** the run is a broadcast
  (`vm.isContext(ScriptBroadcast)`), so a dry run never links an address that was not sent. Label
  `endcredits_escrow`, alias `escrow`, version `1.0`, starting block `-100`.
- **The plugin swallows link errors:** with a bad URL the script logs
  `Link Contract: Error during validation: ...` and still exits 0 (tested on anvil). The deploy log
  has to be read for that line. The link also runs during simulation, before the tx is sent, so a
  failed broadcast after a good link leaves a MultiBaas address with no contract; re-run with
  `MULTIBAAS_ALLOW_UPDATE_ADDRESS=true`.
- **Tx queue:** every write is simulated first (inside the queue, after the previous tx from that
  key is mined), so a revert is named from the custom error before anything is signed. Nonce comes
  from `getTransactionCount(blockTag: "pending")`; one retry on `nonce too low` with a fresh nonce.
  If a mined tx reverts anyway, the call is replayed at `blockNumber - 1` to name the error, else
  `unknown`. Errors are `TxRevertedError` with `errorName`.
- `refund` and `claim` are sent from the recorder key (DESIGN §2), though the contract lets anyone
  call them after expiry / always.
- Receipt polling is 1 s by default (Base Sepolia blocks are 2 s; viem's default is 4 s).
- The integration test (`lib/chain/escrow.anvil.test.ts`) uses anvil on `:8546`, starting one if
  none is running, and skips when anvil or `contracts/out` is missing. It stands in for the live
  Base Sepolia test until the escrow is deployed.
- `origin/e0-foundation` had committed a gitlink for `.claude/worktrees/agent-a44bbe6f…`, which
  broke `git submodule update`; removed on this branch.

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
