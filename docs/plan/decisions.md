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
## E9

Sources: `@curvegrid/multibaas-sdk` 1.1.1 types and docs (`npm pack`), the live pages
`docs.curvegrid.com/multibaas/webhooks/` and `/event-indexing/` (26 Sep), and the CONFIRM-B notes.
Nothing below has been run against a deployment yet; the UNVERIFIED items are what
`scripts/multibaas-setup.ts` step (d) checks first.

- **Plain fetch, no SDK.** `lib/multibaas/client.ts`: `Authorization: Bearer`, `/api/v0`, unwraps
  `{status, message, result}`, 8 s deadline, typed `MultiBaasError` (`timeout`, `network`, `http`,
  `envelope`, `parse`). The key is never in a message.
- **`PUT /queries/{label}` takes the `EventQuery` itself** as the body (SDK `setEventQuery(label,
  eventQuery2: EventQuery)`), not `{query}`.
- **Six saved queries, not five.** `paid_totals`, `held_status`, `reserved_by_package`,
  `reserved_sessions`, `sessions`, `recent` (`lib/multibaas/queries.ts`). `reserved_sessions`
  exists because there is no distinct aggregator and the package table needs sessions per package.
- **No nested filters anywhere.** Each event has one flat filter. `paid_totals` filters
  `Transfer.from == payer` (checksummed) and selects `contract_address_alias`; rows from any token
  other than `usdc` and transfers to the escrow (hold / reserve funding) are dropped in code.
- **No count aggregator:** every count is taken from rows. Non-aggregated queries are read in pages
  of 1000 until a short page (at most 10 pages, then an error rather than a truncated sum).
- **One alias set per query, lowercase snake case,** so multi-event queries line up column by
  column, and in case aliases come back lowercased. `event_signature` is selected to tell events
  apart; `held_status` puts `expiresAt` / `approvalRef` / `expired` in one `detail` column and only
  reads Refunded's (denied vs expired). `recent` leaves out `ClaimSet` (no amount).
- **Values are parsed strictly:** amounts must be whole base units (`"123"`, `123`, `"123.000"`);
  bytes32 and addresses must be hex. Anything else is a `parse` error → 503. No type conversions
  may be set on the `usdc` or `escrow` labels, or amounts stop being base units.
- **Dashboard (`/api/dashboard`)**: paid = sum and count of payer → anyone-but-escrow USDC
  transfers; projects = distinct package keys paid (tx hash → `credits.tx_hash` → package) or ever
  reserved; held = per tip, Released → approved, Refunded → denied / expired, else pending; refused
  = `credits.outcome = 'refused'` count, `source: "decision_log"`; reserved = `reserved_by_package`
  balances > 0. A payer transfer with no matching credit (the x402 smoke test) counts in paid but
  maps to no package.
- **Cache 60 s** (TICKETS says 15 s; 60 s because of the free plan's 30k calls a month: one refresh
  is 6 calls). Invalidated when the webhook stores an escrow event; failures are not cached. The
  route answers 503 `{error: "multibaas_unavailable", kind, detail}`; a DB failure is
  `dashboard_unavailable`.
- **Webhook (`/api/webhooks/multibaas`)**: HMAC-SHA256 over the exact body bytes then the timestamp
  string, `timingSafeEqual`, timestamps more than 300 s off either way → 401. The body is read with
  `arrayBuffer()`, not `text()`, so the bytes are exactly what was signed. Kept: items whose
  `contract.addressLabel` (or `addressAlias`, the SDK's name for it) is `escrow` and whose name is
  Held, Released, Refunded, Reserved, Claimed or SessionSettled; everything else is dropped before
  any DB call. De-dup key `webhook_events.event_id = <txHash lowercase>:<indexInLog>`; the MultiBaas
  delivery id is kept in the payload as `multibaasId`. Insert and notification run in one
  transaction. Held → a `held` notification for every owner whose `payer_address` equals
  `Held.payer`, with `hold_id` when the settler has already written the hold row.
- **UNVERIFIED until run live:** event names as `eventName` (`"Transfer"`, not the signature);
  filter value case for addresses; mixed input types in one alias column (`detail`); `orderBy` on an
  alias in a non-aggregated union; value formats in rows (uint256 as string, bytes32 as hex);
  whether `limit=1000` is honoured; the webhook's `addressLabel` field on this version; whether
  redeliveries keep the same `id` (the de-dup key does not depend on it).
- `scripts/multibaas-setup.ts` was not run: `~/.config/dominion/multibaas-url` and
  `multibaas-key` do not exist yet and the escrow is not deployed.

## Screen age (26 Sep)

Address screens are reused for 5 minutes, token screens for 1 hour. The x402 route refuses to pay on
an address screen older than 10 minutes, so a 1 hour reuse would decide `paid` and then fail at
payment. Found while wiring E7.
## E10

### CONFIRM: GitHub endpoints (26 Sep, docs.github.com read through r.jina.ai)

- OAuth web flow: `GET https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`,
  `scope`, `state`, and PKCE `code_challenge` + `code_challenge_method=S256` (only S256 is
  supported). `POST https://github.com/login/oauth/access_token` with `client_id`,
  `client_secret`, `code`, `redirect_uri`, `code_verifier`; `Accept: application/json` returns
  `{access_token, scope, token_type}`. A bad code answers 200 with `{error}`, so we check for
  `access_token`, not the status. The code lives 10 minutes. We use state and PKCE.
- REST, header `X-GitHub-Api-Version: 2026-03-10` (the version in today's docs):
  `GET /user` (`id`, `login`); `GET /repos/{o}/{r}` (`default_branch`, `permissions`);
  `GET /repos/{o}/{r}/git/ref/heads/{branch}` (`object.sha`); `POST /repos/{o}/{r}/git/refs`
  `{ref: "refs/heads/…", sha}` (201, 422 when it exists); `GET|PUT /repos/{o}/{r}/contents/{path}`
  (`?ref=`; PUT takes base64 `content`, `message`, `branch`, and `sha` when replacing a file);
  `POST /repos/{o}/{r}/pulls` `{title, body, head, base}` (201, 422 when one is open for the
  head); `GET /repos/{o}/{r}/pulls?head=owner:branch&state=open`; `GET /repos/{o}/{r}/pulls/{n}`
  (`merged`, `merge_commit_sha`: after a merge, the merge or squash commit on the base branch).
- **Scope:** the scopes page says `public_repo` gives read/write to code in public repos, but the
  contents PUT page says "OAuth app tokens … need the `repo` scope". We ask for `public_repo`
  (the research in confirm-b §6) and rely on the fallback: any 403 or 404 in the PR steps gives
  the new-file link. Not verified with a live OAuth App token yet.
- **New-file link** `https://github.com/{repo}/new/{base}?filename=FUNDING.json&value=<urlencoded>`:
  `filename` and `value` are not in GitHub's docs (the "creating new files" page and the PR
  query-parameter page do not list them). Behaviour known from use, not confirmed here.

### Choices

- **Routes.** Next.js throws "Catch-all must be the last part of the URL", so
  `/api/claim/[...name]/wallet` cannot exist. One route `app/api/claim/[...slug]` takes the action
  as the last segment: `POST …/<name>/wallet`, `POST …/<name>/pr`, `GET|POST …/<name>/status`.
  Scoped names work unencoded (`/api/claim/@scope/pkg/status`).
- **Session:** iron-session cookie `ec_maint` (SESSION_SECRET, 24 h, httpOnly, SameSite=Lax,
  Secure on https). It holds the OAuth `state`, PKCE verifier and `pkg` during sign-in, then
  `maintainerId`. POSTs with a foreign `Origin` get 403.
- **Token at rest:** AES-256-GCM, key = HKDF-SHA256(SESSION_SECRET, info `endcredits:seal:v1`),
  stored `v1.<iv>.<ct>.<tag>`. Set to null once the claim is `claimed`; after that the status
  reads use `GITHUB_TOKEN_READ` (optional) or go unauthenticated.
- **ALREADY_PAYABLE** runs `resolvePayee` (claim, FUNDING.json, tea.yaml, npm funding); a payee
  whose source is `claim` does not block, anything else does. The page summary runs it with a
  no-op observation store so a page view writes nothing.
- **PR step is re-runnable:** an existing branch (422) is reused, the file is only written when it
  differs, and a 422 on the PR looks up the open PR for `owner:endcredits/funding-json`.
  Non-403/404 GitHub errors are 502 `github_error`, not the fallback.
- **New message `PR_LINK`** for the fallback. PR title and body are repository content, kept in
  `lib/github/claim.ts`, not `lib/messages.ts`.
- **Status machine:** `wallet` → `pr_open` → `merged` (api mode, PR merged) → `verified` (FUNDING.json
  on the default branch names the wallet) → `claimed` or `refused`. In new-file-link mode the
  file alone is the proof; `merged_sha` then holds the default branch head at verification.
  A mismatch keeps the status and sets `failure_code = FUNDING_MISMATCH`. A refusal stores the
  Intercepta description in `failure_code` so repeat reads show the same message.
- **Screen:** Intercepta quick scan only (not `screenPayee`: no amount or token here). Refused on a
  `CRITICAL` trait or `toxicScore > 50`, the matrix's thresholds. Any failure, including a missing
  `INTERCEPTA_API_KEY`, answers `SCREEN_UNAVAILABLE` and stops before `setClaim`; the next check
  retries.
- **Evidence** = `keccak256(utf8(repo + sha))`, `sha` the merge commit (or branch head, link mode).
- **Payout:** every `packages` row with the same `repo_full_name` and `reserved > 0` on chain;
  `setClaim` is skipped when the chain already names the wallet; `ClaimCoolingDown` answers
  `COOLING` with `changedAt + changeDelay` and keeps status `verified`; `NothingReserved` (a
  concurrent check won) is skipped. A package whose npm `repository` wrongly points at this repo
  would also be claimed by the repo's maintainer; the money goes to the real repo owner, so this
  is left as is.
- **`claims.claimed_micro`** (migration `0002_claim_amount`) stores the claimed total, so repeat
  status calls answer `CLAIMED` with the same amount without re-reading receipts.
  `set_claim_tx` keeps the first setClaim tx; `claim_txs` every claim tx.
- **`GET /api/npm/<name>`** reads `reserved(packageKey)`, `claims(packageKey)` and `changeDelay()`
  from the escrow directly (MultiBaas is on E9). A failed read puts `chain` or `payee` in
  `errors` and leaves the value null. `sessions` counts distinct sessions with a `reserved`
  credit for the package. A package not in our table is read from npm and not stored.

## E11

- **Discovery doc, read live 26 Sep** (`curl https://auth.world.org/.well-known/openid-configuration`):
  issuer `https://auth.world.org`; authorize `/api/v1/authorize`, token `/api/v1/token`, device
  `/api/v1/device_authorization`, JWKS `/.well-known/jwks.json` (one RS256 key). Token auth methods
  `client_secret_basic`, `client_secret_post`, `private_key_jwt` (RS256). ID token alg RS256 only.
  `response_types` `code`, `response_modes` `query`, grants `authorization_code` and
  `urn:ietf:params:oauth:grant-type:device_code`, scope `openid` only, PKCE `S256` only, prompt
  `none` and `login`, acr `https://world.org/oidc/acr/orb-v3` only, subject type `pairwise`,
  `request_uri` not supported. Claims `iss sub aud exp iat jti nonce auth_time acr amr`.
- The endpoints are built from `WORLD_ISSUER` with those fixed paths; no discovery request at boot.
- **Libraries:** `openid-client` 6.8 (authorize URL, PKCE, state, nonce, code grant, device grant)
  and `jose` 6.2 (`compactVerify` against the issuer's remote JWKS). openid-client does not check the
  ID token signature in the code flow (TLS token endpoint); our `verifyIdToken` does, and is the
  check of record for every flow.
- **Basic auth:** own `ClientAuth` sending `Basic base64(encodeURIComponent(id):encodeURIComponent(secret))`.
  openid-client's `ClientSecretBasic` also encodes `_ - . ~`, so `app_…` goes out as `app%5F…`; a
  server that does not form-decode the header would not know that client. Ours is identical for any
  server when id and secret are unreserved characters.
- **Callback URL:** the token request's `redirect_uri` is rebuilt from `APP_URL` + path + query,
  not `req.url`, which carries the internal host behind the Railway proxy.
- **openid-client claim errors** (nonce, iss, aud/azp, exp) are mapped to the same codes as
  `verifyIdToken`; any other exchange failure is `TOKEN`. Its clock tolerance is its default 30 s,
  same as ours.
- **Approval nonce payload** adds `attempt` (the approval row id) to DESIGN §14.2's fields.
  `approvals.nonce` is unique, and without it a retry of the same tip (after CANCELLED or
  STALE_AUTH) would hash to the same nonce. `amount` is micro-USDC as a decimal string.
  `approvalRef = keccak256(utf8(nonce))`.
- **Sealed secrets:** the approval's PKCE verifier and the device code are sealed with E10's
  `lib/crypto/seal.ts` (AES-256-GCM, key from `SESSION_SECRET`). A started approval is good for
  10 minutes from `started_at` (then `STALE_AUTH` before any token call); a device session until
  its `expires_at`. The sign-in's state,
  nonce and verifier live in the `ec_world` iron-session cookie (10 min, httpOnly, sameSite lax,
  path `/api/auth/world`), cleared on the callback whatever happens.
- **Owner binding:** first World sign-in binds the first owner row (`created_at`, the same one dev
  login used) only while its `iss` is null, as a conditional update; any other human after that is
  `WRONG_HUMAN`. Sign-in failures redirect to `/owner?world=<CODE>` (`CANCELLED`, `STATE`, the token
  codes, `WRONG_HUMAN`, `NO_OWNER`).
- **Step-up start:** `POST /api/approve/:tipId/start` starts World instead of releasing when
  `WORLD_REQUIRED=true` or `APPROVE_METHOD=world`, answering `{status: "verify", url}`. It needs
  the owner bound to a World ID (else 409 `world_not_bound`) and the same hold checks as the
  session path (404 / 409 / 410). The session path's 403 under `WORLD_REQUIRED` is replaced by this.
- **Step-up callback:** order is state (400 `UNKNOWN_STATE`, also for a used or failed state),
  `error` param (`CANCELLED`, any error value), verifier seal (expired → `STALE_AUTH`), exchange and
  `verifyIdToken` with the row's nonce, `(iss, sub)` equal to the owner (`WRONG_HUMAN`), `auth_time`
  (seconds) `>= floor(started_at)` in seconds (`STALE_AUTH`, also when missing), then the release
  under the hold lock with the same checks as the session path. Every failure sets the approval
  `failed` with its code and redirects to `/approve/<tipId>?result=<CODE>`; success redirects with
  `result=APPROVED`. The callback does not need the owner cookie: the ID token is the proof.
- For the page: `CANCELLED`, `STALE_AUTH`, `WRONG_HUMAN`, `NONCE`, `ACR` have their own messages;
  `AMR` reads best as `ACR`; `SIG`, `ISS`, `AUD`, `EXP`, `SUB`, `TOKEN` show `VERIFY_FAILED`. New
  messages: `UNKNOWN_STATE`, `VERIFY_FAILED`, and the CLI's `LOGIN_*`.
- **Device grant:** `/api/agent/device/start` is unauthenticated (the CLI has no key yet) and not
  rate limited. The poll `id` is a v4 uuid known only to that CLI; the device code never leaves the
  server. One token request per poll call; the CLI owns the interval. `device_sessions.status`:
  `pending`, `complete`, `denied`, `expired`, `failed`; a terminal status answers the same on every
  later poll. The key is issued in one transaction with a conditional `pending → complete`, so two
  racing polls issue one key. No binding on this path: the `(iss, sub)` must already be an owner.
- **UNVERIFIED until a live World App run:** that World's token endpoint accepts our Basic header;
  `auth_time` present in the step-up ID token and after `max_age=0`; the cancel redirect's exact
  `error` value; whether the device grant's ID token carries `acr` orb-v3 and `amr` `pop` (we
  require both); `verification_uri_complete` and `interval` in the device response; `aud` shape;
  the production portal URL.

## E8 frontend: roll and history

- **Main signal.** `GET /api/sessions/:id` now carries `signal: {signal, count}` per credit: the
  usage row with the largest `WEIGHT × count`, the heavier signal on a tie. The roll shows it as
  "import · 6".
- **`settleRequested`** is added to the session view, so the **Roll credits** button hides once
  anyone pressed it and the status line reads "Rolling requested" until the settler moves the
  session to `settling`. The button shows for any `uploaded` session; the settle route decides
  (401 links to `/owner`, 403 and 409 show their line).
- **Totals line** appears only once `settled`. Paid counts `paid` and `capped`; held, reserved
  and refused count their own outcome; dust and undecided rows are left out. "Refused W" is a
  count of refused credits, not an amount, since refused money never leaves the owner.
- **Polling** every 1 s while `uploaded` or `settling`; stops on `settled`, `failed` or 404. A
  5xx or network error keeps the last view on screen, shows the error and keeps retrying.
## E8/E9 frontend: dashboard and landing

- `/dashboard` is a server page around one client view. It fetches `/api/dashboard` on load, every
  30 s and on **Refresh**, one request at a time. The route's own 60 s cache means most refreshes cost
  no MultiBaas calls.
- Any failed fetch replaces the numbers with the error (`HTTP 503 · multibaas_unavailable (network):
  <detail>`). The last good numbers are not kept on screen, so nothing shown can be older than the
  error above it.
- `recent[].at` comes back as Postgres text (`2026-09-25 18:46:24+00`), not ISO; `parseTime` in
  `lib/client/dashboard.ts` reads both and shows `—` for anything it cannot parse, never "now".
- Held lists pending first. Packages sort by paid + reserved (as integers from `micro`), then
  sessions, then name. Recent sorts by block, newest first.
- A recent event's subject is shown as the package name when it is a package key the table knows
  (Reserved, Claimed); tip ids and session ids stay shortened hex. The API has no tip → package map.
- `/` is static. The measurement is SPEC §6.1 (41.6% / 2.1%, top 1,000, 25 Sep 2026), copied into
  `lib/copy/landing.ts`; change both together. `NOT_A_PAYWALL` is read from `lib/messages.ts`.
- Checked 26 Sep against the live MultiBaas with an empty local DB: cards showed 5 denied holds
  (0.05 USDC), 10 recent escrow events with Basescan links; the bad-host run showed the 503 detail
  and no numbers. Refused and package names need the production DB, so they read 0 / none locally.
## Stale RPC reads (26 Sep)

- **What happened:** `https://sepolia.base.org` is load-balanced over nodes that lag each other.
  `hold(tipId)` mined (receipt status 1), the `refund(tipId)` right after was simulated on a node
  that had not seen the hold, reverted `NotPending`, and the queue threw before sending. 0.01 USDC
  sat in escrow until refunded by hand. A `tipOf` read just after the hold receipt also said `none`.
- **Fix:** `createTxQueue` re-simulates when the pre-send simulation reverts with a custom error:
  waits `staleDelayMs` (1500) and tries again, up to `staleRetries` (2) more times, then throws
  `TxRevertedError` with the decoded name. A genuine revert costs about 3 s before it is named.
  Errors that are not a revert (network, RPC) are thrown at once, as before.
- **Why no block pin:** the failing pair crosses keys (hold is payer, refund is recorder), so a
  per-key "at least the receipt's block" pin would not have covered it. Pinning `eth_call` to a
  block number would also freeze a later simulation at an old block, and a `getBlockNumber()` gate
  can hit a different node than the call it gates. Retrying the simulation is enough for writes:
  a wrong "pending" answer can only make us send, and the chain then reverts the tx for real.
- **Reads are not fixed here.** `tipOf`, `reserved` and friends can still be a block or two behind
  right after a receipt; callers that act on a read made straight after their own write should
  trust the receipt, not the read.
- Live check, 26 Sep: hold then immediate refund, 3 times on `sepolia.base.org`, all refunded
  (holds `0xd36dcf08…`, `0x68f22392…`, `0xb964ad55…`; refunds `0xcd5853f2…`, `0x13fee051…`,
  `0xf1d0a896…`). Not logged whether a re-simulation fired on these runs.
