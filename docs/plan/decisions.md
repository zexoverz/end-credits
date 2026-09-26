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

## E8 frontend: owner and approve

- Both pages are thin client components behind a server `page.tsx` that only reads `params` and
  `searchParams` (`?world=`, `?result=`). All data comes from the existing APIs; no API was added.
- **The page never decides an outcome.** `?result=<CODE>` after the World step-up is a hint: the
  server's view wins. A final status shows the server's recorded message; while pending, the
  server's `failureCode` wins over the query, and `result=APPROVED` with a pending view is ignored.
  Codes are mapped per decisions E11 (`AMR` as `ACR`, token codes as `VERIFY_FAILED`); an unknown
  code shows the generic release failure and is echoed only if it matches `[A-Za-z0-9_]{1,64}`.
- `POST /start` answering `{status: "verify", url}` is followed only when `url` is https.
- Hold TTL is edited in whole minutes (1 to 10080) and sent as seconds. USDC fields are checked for
  shape only on the client; ranges and `cap_over_budget` come back from the API and are shown per
  field.
- The agent token lives only in component state until **Done**; it is never refetched or stored.
- At sign-in, `WRONG_HUMAN` reads "This World ID is not the owner of this account." (the §11 text
  speaks of an approval). Expired before the expirer's refund reads "refund on its way", not
  "returned".
- **API gap:** the approve view's `worldRequired` is `WORLD_REQUIRED` only; with
  `APPROVE_METHOD=world` alone the button reads **Approve** but still goes through World.
  Notifications have no mark-read endpoint, so the unread list only grows.
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

## E10 frontend

### CONFIRM: passkey wallet SDK (26 Sep, installed `@base-org/account` 2.5.13 README and `.d.ts`, Context7 `/websites/base`)

- `@base-org/account` is the current SDK; its README: "Base Account is now Coinbase Wallet. The
  npm package remains `@base-org/account`". Pinned `~2.5.13`. No wagmi.
- `createBaseAccountSDK(params: Partial<AppMetadata> & {preference?, subAccounts?, paymasterUrls?})`
  returns `{getProvider(), subAccount}`; `AppMetadata = {appName, appLogoUrl, appChainIds}`
  (`dist/interface/builder/core/createBaseAccountSDK.d.ts`, `dist/core/provider/interface.d.ts`).
  `getProvider()` is EIP-1193; `request({method: "eth_requestAccounts"})` opens the
  keys.coinbase.com popup and resolves to `string[]`; 4001 is a user rejection.
- It is a passkey smart account only, so there is no `smartWalletOnly` option to set.
- We call `createBaseAccountSDK({appName: "End Credits", appChainIds: [84532]})` once, on the first
  button press. `NEXT_PUBLIC_CB_APP_NAME` is not needed.
- **Import `@base-org/account/browser`, not the bare name.** The bare name resolves to
  `dist/index.node.js` in the SSR build, which pulls `@coinbase/cdp-sdk` and fails on
  `@x402/svm/exact/client`. The `./browser` export has no CDP dependency.

### Choices

- `/npm/[...name]` is a server wrapper (params, `?github=cancelled`) around one client component.
  The step state is derived in `lib/client/claim.ts` from the summary and the latest `ClaimView`,
  never stored.
- Steps are locked for everyone when the package has no repo, already has a non-claim payee
  (ALREADY_PAYABLE) or is claimed by someone else; the visitor's own claim always shows.
- A failed chain read shows an error line; "nothing reserved" only appears after a good read.
- The page polls `GET …/status` every 5 s while the claim is `pr_open`, `merged` or `verified`;
  "Check now" sends a POST. On load, an open claim asks the status once so its message shows.
- "Use an existing address" posts the same `wallet` call; a closed passkey popup may never answer,
  so waiting on it does not disable the fallback.
- Funding links from `package.json` are rendered only when `http:` or `https:`.

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

## Live deployment (26 Sep)

- `EndCreditsEscrow` on Base Sepolia at `0x63047583FbCe241D72d71137C940aa27BBdC60f1`, deployed from
  `ethglobal-tokyo` through the forge-multibaas plugin (tx `0x3ddf9e35…6ed8`). Verified on Sourcify
  (`exact_match`), Blockscout and Basescan.
- MultiBaas deployment on Base Sepolia: escrow linked as `escrow`, USDC linked as `usdc`, six saved
  queries, webhook `endcredits` to `/api/webhooks/multibaas`. The live API rejects a contract
  without bytecode, answers PUT /queries without `result`, caps `limit` at 50, and returns bytes32
  as a byte-array string; all four handled.
- Live checks: hold then refund round trips through `lib/chain`, indexed by MultiBaas, `Held` and
  `Refunded` delivered by the webhook, owner notifications created; a CLI-recorded session
  uploaded to production and shown on the roll before settlement.
- Postgres has a Railway TCP proxy so migrations and the seed run from the laptop.

## E12 fixtures (26 Sep)

Seven `@endcredits-demo/*` packages under `fixtures/`, each also pushed at the root of its own public
repo so the anti-spoof check finds the same name in the root `package.json` and resolution reads
`FUNDING.json` at `HEAD`. Checked with `pnpm tsx scripts/check-fixtures.ts` (spoof ok on all seven).

| Package | Repo | FUNDING.json | Outcome |
|---|---|---|---|
| `moved-payout` | https://github.com/zexoverz/endcredits-fixture-moved-payout | A | held, `ADDRESS_CHANGED` once it moves to B |
| `left-padder-pro` | https://github.com/zexoverz/endcredits-fixture-left-padder-pro | SDN address | refused by Intercepta |
| `unclaimed-utils` | https://github.com/zexoverz/endcredits-fixture-unclaimed-utils | none | reserved, claimed live in the judged demo |
| `unclaimed-rehearsal-1` | https://github.com/zexoverz/endcredits-fixture-unclaimed-rehearsal-1 | none | reserved, claimed in a rehearsal |
| `unclaimed-rehearsal-2` | https://github.com/zexoverz/endcredits-fixture-unclaimed-rehearsal-2 | none | same |
| `unclaimed-rehearsal-3` | https://github.com/zexoverz/endcredits-fixture-unclaimed-rehearsal-3 | none | same |
| `unclaimed-finalist` | https://github.com/zexoverz/endcredits-fixture-unclaimed-finalist | none | reserved, claimed in the finalist run |

- **Addresses** (`fixtures/ADDRESSES.md`): A `0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551`, B
  `0xeF4509C258107F5A37fb7e76af4F99a7DD3c6aa2`, both from `cast wallet new`; only the addresses were
  kept. They only receive.
- **Why the SDN address:** `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` is on the OFAC SDN list
  (Lazarus Group / Ronin, SDN.CSV entry 27307). A refusal needs an address Intercepta flags for a
  reason nobody disputes, and rule 9 forbids pointing that at a real package, so the fixture's own
  README says on line 2 that the address is deliberate.
- **npm:** `scripts/publish-fixtures.sh` publishes after `npm login` and creating the
  `endcredits-demo` org; it skips versions already on npm. Not run yet.
- **Demo repo:** https://github.com/zexoverz/endcredits-demo-reports, Next.js with a static
  `/reports` page and `zod`, `date-fns`, `@tanstack/react-query`, `react-day-picker`. The fixtures
  are added after publish; `DEMO.md` there has the command and the session prompt.

## MCP server

The agent takes part in the flow through `endcredits mcp`, a stdio MCP server in the same bundle. It
reads and requests; it never decides. Who gets paid stays with the screened settler, and every tool
description says so.

- **CONFIRM: MCP SDK.** `@modelcontextprotocol/sdk` 1.30.1 (npm latest, 26 Sep), pinned `~1.30.1`
  as a CLI devDependency and bundled by esbuild. `McpServer` from `server/mcp.js`,
  `registerTool(name, {title, description, inputSchema: <zod raw shape>}, cb)`,
  `StdioServerTransport` from `server/stdio.js`. Peer `zod` `^3.25 || ^4`; we pass zod 4 shapes.
- **CONFIRM: Claude Code registration** (code.claude.com/docs/en/mcp, Claude Code 2.1.283). Project
  scope is `.mcp.json` at the project root, `{"mcpServers": {"<name>": {"type": "stdio", "command",
  "args", "env"}}}`; Claude Code asks for approval on the next interactive start. User scope:
  `claude mcp add --scope user <name> -- <command> [args]` (the default scope is local).
  `endcredits init` merges `end-credits` into `./.mcp.json` and never replaces an existing entry;
  `init --global` prints `claude mcp add --scope user end-credits -- endcredits mcp`.
- **Tools.** `end_credits_status {sessionId?}`: local attribution plus an estimated `split` of the
  owner's budget from `GET /api/agent/settings`; unreachable → defaults 2 / 0.25, labelled as such.
  `end_credits_roll {sessionId?}`: the `settle --session` upload path (10 s timeout, no browser),
  reusing `<id>.done.json` when already uploaded, then `POST /api/agent/sessions/:id/settle`; 409
  reads as "already rolling" (auto mode sets `settle_requested_at` at upload). `end_credits_explain
  {sessionId}`: `GET /api/sessions/:id`, stored reason texts, Basescan links, approve links for held
  credits; while not settled it names the rows still screening. The default session is the most
  recently touched ledger: the MCP process is not given the Claude Code session id.
- **Agent-key routes.** Bearer agent key via `lib/sessions/auth.ts`; revoked keys 401. Settle only
  for the key that uploaded the session (403 otherwise, 404 unknown), same 202/409 update as the
  owner route. Settings returns the owner's `settingsView`.
- `GET /api/sessions/:id` credits now carry `tipId` (null except on held credits).
- stdout is the protocol; logs go to stderr; the agent key is never in a result. The bundle grows
  from ~30 KB to 1.4 MB; a `record` hook run costs ~5 ms more (73 vs 68 ms, node boot included).
## Escrow v2 (owner-signed release)

**Why.** In v1 `release` needed only the recorder, our server key, so a compromised server could
send any held tip to its payee. v2 adds a second key the server does not hold: each payer names an
approver (the owner's own wallet), and `release` needs that approver's EIP-712 signature over the
exact tip. The recorder still submits the tx, but can no longer release on its own, change the
payee or amount (both come from storage and are in the signed struct), reuse a signature on another
tip, escrow or chain (`tipId` plus the EIP-712 domain), or hold a signature forever (`deadline`).

- **Approver per payer.** `setApprover(approver)` is called by the payer. Zero reverts
  `ZeroApprover`. The first set is immediate. A later set to a different address is stored as
  `pending` with `activeAt = now + changeDelay` (the same immutable delay as claims, 3 days); until
  then the old approver alone signs, from `activeAt` on the new one alone. Setting the current
  address again is a no-op (no event, no delay) and does not cancel a pending change. Setting a
  third address while one is pending replaces it and restarts the clock. `approverOf(payer)` is a
  view that applies a due change; `setApprover` and `release` write the promotion (lazy). `hold`
  only reads `current`, since a pending change never exists without one.
  `ApproverSet(payer, approver, activeAt)`; for the first set `activeAt` is the set time.
- **`hold`** reverts `NoApprover(payer)` when the payer has none. The check comes after the v1
  checks, so v1 revert order is unchanged.
- **`release(tipId, approvalRef, deadline, signature)`** checks in this order: `NotRecorder`,
  `NotPending`, `TipExpired`, `SignatureExpired(deadline)` (`block.timestamp > deadline`, so the
  deadline second itself is valid), then `BadApproval()` from OZ
  `SignatureChecker.isValidSignatureNow(approverOf(payer), digest, signature)`: ECDSA for an EOA,
  ERC-1271 for a contract. The approver is the one in force at release time, not at hold time.
  `Released` is unchanged.
- **Typed data** (domain from OZ `EIP712`, readable via `eip712Domain()`; digest via
  `releaseDigest(tipId, approvalRef, deadline)`):
  domain `{ name: "EndCreditsEscrow", version: "2", chainId: 84532, verifyingContract: <escrow> }`,
  `Release(bytes32 tipId,address payee,uint256 amount,bytes32 approvalRef,uint256 deadline)`, with
  `payee` and `amount` read from `tipOf(tipId)`.
- **`refund`**: the tip's payer may now deny any time while pending, as the recorder can; anyone
  still may after expiry. The approver alone cannot refund.
- **What the timelock buys, and what it does not.** `PAYER_PRIVATE_KEY` is also a server key today,
  so a server that holds both keys can call `setApprover` as the payer. The delay means such a change
  is public (`ApproverSet`) for 3 days before it counts, and every tip held with a TTL up to the
  delay (default 1 day) has expired and is refundable by then. A tip held with a TTL above
  `changeDelay` (the max is 7 days) could still be released by a hijacked approver after `activeAt`,
  so the backend should keep TTL at or below `changeDelay` and alert the owner on any `ApproverSet`.
  Likewise the payer refund only gives the owner a server-free deny once the payer is the owner's
  wallet.
- **ERC-6492, for the backend.** A Coinbase / Base Account passkey wallet can be counterfactual
  (not yet deployed). It then signs with an ERC-6492 wrapper (`factory, factoryCalldata, sig` plus
  the `0x6492…6492` magic suffix), which `SignatureChecker` does not accept: with no code at the
  address it tries ECDSA and fails `BadApproval`. The backend must detect the suffix, deploy the
  wallet by calling `factory` with `factoryCalldata` (permissionless, any key can send it), then
  submit the unwrapped inner signature to `release`. The contract does not implement 6492.
  The same applies to `setApprover`: the approver address may be counterfactual when set, which is
  fine, but it must have code by the time `release` checks the signature.
- `Deploy.s.sol` is unchanged apart from linking in MultiBaas as version `2.0`; the constructor is
  the same. `scripts/multibaas-setup.ts` still says `1.0` (follow-up).
- Gas (forge `--isolate`, one call): `hold` 176,056 (first tip of a payer), `release` 76,609 with
  an EOA approver, 79,793 with the ERC-1271 mock, `setApprover` 48,510 (first set).

### Escrow v2 mutation pass

Each row: the guard deleted (or the value swapped) in `contracts/src/EndCreditsEscrow.sol`, then
`forge test`, then the source restored (scripted, the file rewritten from the saved original).
Run on 2026-09-26; `git diff` on `src/` was clean afterwards. The v1 table above still holds.

| hold: `NoApprover` | `test_hold_revertsWithoutApprover` |
| setApprover: `ZeroApprover` | `test_setApprover_revertsOnZero` |
| setApprover: same address is a no-op | `test_setApprover_sameAddressIsNoop` |
| setApprover: change goes to `pending` (swapped to set `current` at once) | `test_release_oldApproverSignsUntilActiveAt`, `test_setApprover_changeAfterDueChangeStartsFromPromoted`, `test_setApprover_changeIsPendingUntilActiveAt` |
| setApprover: `changeDelay` added to `activeAt` | `test_release_oldApproverSignsUntilActiveAt`, `test_setApprover_changeAfterDueChangeStartsFromPromoted` |
| setApprover: `_promote` before a change | `test_setApprover_changeAfterDueChangeStartsFromPromoted` |
| approverOf: pending promoted once due (branch removed) | `test_setApprover_changeIsPendingUntilActiveAt` |
| approverOf / _promote: `>=` swapped to `>` at `activeAt` | `test_release_oldApproverSignsUntilActiveAt`, `test_setApprover_changeAfterDueChangeStartsFromPromoted`, `test_setApprover_changeIsPendingUntilActiveAt` |
| release: `SignatureExpired` | `test_release_revertsAfterDeadline` |
| release: signature check (`BadApproval`) | `test_release_oldApproverSignsUntilActiveAt`, `test_release_revertsOnEmptyOrGarbageSignature`, `test_release_revertsOnErc1271OtherSigner`, `test_release_revertsOnErc1271WrongMagic`, `test_release_revertsOnOtherDomain`, `test_release_revertsOnOtherSigner`, `test_release_revertsOnSignatureOverOtherAmount`, `test_release_revertsOnSignatureOverOtherApprovalRef`, `test_release_revertsOnSignatureOverOtherDeadline`, `test_release_revertsOnSignatureOverOtherPayee`, `test_release_revertsOnSignatureOverOtherTip`, `test_release_revertsWhenRecorderSigns` |
| release: `_promote(tip.payer)` | `test_release_oldApproverSignsUntilActiveAt` |
| releaseDigest: payee in the struct hash (swapped to `address(0)`) | `test_refund_revertsAfterRelease`, `test_releaseDigest_matchesTypedData`, `test_release_acceptsErc1271Wallet`, `test_release_oldApproverSignsUntilActiveAt`, `test_release_paysFixedPayee`, `test_release_revertsAfterDeadline`, `test_release_revertsTwice`, `test_release_succeedsJustBeforeExpiry` |
| releaseDigest: amount in the struct hash (swapped to 0) | `test_refund_revertsAfterRelease`, `test_releaseDigest_matchesTypedData`, `test_release_acceptsErc1271Wallet`, `test_release_oldApproverSignsUntilActiveAt`, `test_release_paysFixedPayee`, `test_release_revertsAfterDeadline`, `test_release_revertsTwice`, `test_release_succeedsJustBeforeExpiry` |
| refund: payer may deny | `test_refund_byPayerBeforeExpiry` |

## Escrow v2 app integration

- **Flow order.** `POST /api/approve/:tipId/prepare` → the owner's approver wallet signs the
  returned typed data (`eth_signTypedData_v4`, Base Account) → `POST /api/approve/:tipId/signature
  {approvalId, signature}` → `POST /api/approve/:tipId/start {approvalId}` → with World required
  (`WORLD_REQUIRED=true` or `APPROVE_METHOD=world`) the existing Orb step-up, whose callback releases;
  else the release runs at once. Deny is unchanged (recorder `refund`).
- **Shapes.** prepare → `{approvalId, approver, typedData}` (typed data as JSON, uint256 as decimal
  strings, `EIP712Domain` listed); 409 `no_approver` when the owner has none. signature → `{status:
  "signed"}`; 400 `bad_signature`. start → as before, plus 409 `no_signature` when the approval has no
  stored signature. The hold's own guards (404, 409 `not_pending`, 410) are checked first on every
  step. `GET /api/owner/approver` → `{approver, onchain, pending: {address, activeAt} | null}`;
  `POST {address}` adds `tx` (null when nothing was sent), 409 `payer_mismatch` when the server's
  payer key is not the owner's payer, 502 `chain_error` with the revert name. `GET /api/owner` has
  `approver`; `GET /api/approve/:tipId` has `hasApprover`.
- **One approval row per attempt.** prepare writes it (`method` from config, `pending`) with
  `approval_ref` and `release_deadline`; signature fills `release_signature`; start moves it to
  `approved` or `failed` (the v1 code inserted the row after the fact). The World step-up now updates
  that row (nonce, state, PKCE verifier, `started_at` reset to the step-up start) instead of inserting
  one, and the nonce payload gains `approval_ref`, so the Orb proof is bound to the signed release.
- **approvalRef** = `keccak256(abi.encode(bytes32 tipId, bytes16 approvalId))`, the approval row's
  uuid as 16 bytes. It is only an audit link (`Released` logs it); the contract does not check it.
- **deadline** = the hold's `expires_at` in unix seconds. `release` reverts `TipExpired` first at that
  point anyway, so the signature lives exactly as long as the tip.
- **The typed data is rebuilt from our rows at every step**, never taken from the client: payee and
  amount from the credit, `approvalRef`/deadline from the approval row, domain from `ESCROW_ADDRESS`
  and the RPC's chain id. A client that edits the message gets `bad_signature`.
- **Signature check.** `publicClient.verifyTypedData` against the owner's stored approver: EOA,
  ERC-1271, and ERC-6492 for a Base Account not yet deployed (viem runs its universal validator in
  an `eth_call`). Tests use viem's local `verifyTypedData` (EOA only); the 6492 path is on anvil.
- **ERC-6492 at release.** `deployErc6492Wallet(approver, sig)`: when the signature carries the
  6492 suffix and the approver has no code, the recorder sends the factory call (`to`, `data` from
  the envelope) through the tx queue (which now takes prebuilt calldata), then `release` gets the
  inner signature; when the wallet already has code it only unwraps. Proven on anvil with the CREATE2
  deployer as factory and `Mock1271Wallet` as the counterfactual approver: `verifyTypedData` accepts
  the wrapped form, `release` with it reverts `BadApproval`, after the deploy the inner one releases.
- **Stored vs on-chain approver.** `owners.approver_address` is what prepare hands out and what
  signatures are checked against. A change is timelocked on chain; `POST /api/owner/approver` stores
  the new address at once and shows the pending change with its `activeAt`. Until then a signature
  from the new wallet passes our check but the release reverts `BadApproval` (shown as a chain
  error). Setting the address already pending is not re-sent, since that would restart the delay.
- **Settler.** `hold` without an approver reverts `NoApprover` in the tx queue's simulation, before
  anything is signed. The credit keeps its stored `held` decision, no hold row is written, and the
  reason `NO_APPROVER` ("Held, but the owner has no approver wallet yet. Set one on /owner.") is
  appended. Nothing moves.
- **Seed.** With `ESCROW_ADDRESS` and `APPROVER_ADDRESS` set and no approver on chain, the payer names
  `APPROVER_ADDRESS` and the owner row stores it; an existing on-chain approver is never changed.
- **MultiBaas.** `scripts/multibaas-setup.ts` now links the escrow as `endcredits_escrow` `2.0` at
  alias `escrow` (same as `Deploy.s.sol`). If the alias points at an older escrow it is moved only with
  `MULTIBAAS_ALLOW_UPDATE_ADDRESS=true`, the forge-multibaas semantics (delete the alias, recreate it,
  relink). The earlier "still says 1.0" note is resolved; USDC stays `usdc` `1.0`.
- **UI.** All wallet code sits in `components/approver/*` (`connect-wallet`, `set-approver` on
  /owner, `sign-release` on /approve) with copy in `lib/copy/approver.ts`; the pages only import and
  place them. The page redesign should keep these files as they are and restyle only.
- Not verified: Base Account `eth_signTypedData_v4` on a real phone (passkey prompt, and whether an
  undeployed wallet returns a 6492 envelope as expected), and `multibaas-setup.ts` against the live
  MultiBaas deployment.

## Escrow v2 deployed (26 Sep)

`EndCreditsEscrow` v2 at `0x849F6cd44e4A3248d033aBB1b670257F77bFCc46` (tx
`0x7f4f4f1fabbb7bca64b0b4babd0752ec71f6519339588c72efc3a25548111fb2`), deployed from
`ethglobal-tokyo` with the forge-multibaas plugin, which moved the MultiBaas `escrow` alias to it as
`endcredits_escrow` 2.0. Verified on Sourcify (`exact_match`) and Basescan. v1 at
`0x63047583FbCe241D72d71137C940aa27BBdC60f1` held only test events and is no longer used; the
dashboard history restarts from v2.

## Nonce reuse on lagging nodes (26 Sep)

- **What happened:** two txs sent back to back from one key on `https://sepolia.base.org`; the
  second read `getTransactionCount(pending)` from a node that had not seen the first, got the same
  nonce, and failed `replacement transaction underpriced` (-32000). The settler sends runs of
  holds/reserves from the payer key and runs of recorder calls, so this would break settlement.
- **Fix:** `createTxQueue` keeps the last nonce a node accepted per key (set only once `write`
  returns a hash). Next nonce is `max(node pending, lastUsed + 1)`. On `nonce too low`,
  `replacement transaction underpriced` or `already known` it retries with
  `max(node pending, lastUsed + 1, triedNonce + 1)`, up to 3 sends; any other error throws at once.
- **Known gap:** `already known` can also mean our own tx reached the pool and the reply was lost
  (a transport retry). Bumping then would send the call twice. Accepted for the demo: the queue
  sends each call once, and escrow calls keyed by `tipId` revert on a duplicate.
- **Process-local:** `lastUsed` lives in memory. Two processes signing with the same key can still
  collide; the settler is the only sender per key.
- Live check, 26 Sep: 3 USDC `transfer`s of 1 micro-USDC back to back from the payer through the
  queue, all mined (nonces 9, 10, 11: `0xc2d4a963…2b52`, `0xab4734c6…5dd9`, `0x87007ad2…e402`).
  Every node answered a fresh pending count on this run, so no retry fired live; the bump paths
  are covered by the unit tests only.

`already known` is not retried after all: it can mean our own transaction reached the pool and
the reply was lost, and a bumped resend would run the same call twice (a second `reserve` would
reserve twice). It throws; the settler records an execution error and nothing moves twice.

## Packages not on the npm registry (26 Sep)

- **Why:** the npm account is suspended, so the `@endcredits-demo/*` fixtures install from GitHub
  (`pnpm add @endcredits-demo/moved-payout@github:zexoverz/endcredits-fixture-moved-payout`). The
  registry 404s for them, and so it does for real packages installed from git or a private registry.
- **CLI:** each uploaded package carries `repository` and `homepage` from the installed
  `node_modules/<name>/package.json`, only when `lib/registry/declared.ts` accepts them: a GitHub
  owner/repo (same regex as `lib/registry/npm.ts`, plus a GitHub owner rule so `../x` is not read as
  a repo), a relative `directory` with no `..`, an https homepage, 512 chars max. Anything else is
  dropped, so no local path leaves the machine and the upload is never rejected for it.
- **Upload:** `uploadSchema` accepts the same fields with the same check. Ingest writes them to
  `packages.declared_repo` / `declared_directory` / `declared_homepage` (migration `0004`). The first
  declaration wins; a later upload never overwrites a declared repo.
- **Settle:** `loadPackage` throws `RegistryNotFound` on a 404 only. The settler then uses the
  declared repo, sets `packages.repo_source = 'declared'`, and adds `REPO_DECLARED` to the credit.
  Downloads and first publish stay unknown (the spam rule does not count unknown as low). Payee
  resolution, the anti-spoof check and change detection run as for a registry package. A 404 with
  nothing declared, or any other registry error, refuses with `RESOLVE_FAILED` as before.
- **Known gap:** for a name not on npm, whoever uploads first picks the repo, and anti-spoof only
  asks that repo's `package.json` to carry the name, which anyone can write. Accepted for the demo;
  the payee still goes through Intercepta and the lookalike and spam rules.
- Live check, 26 Sep (script deleted): `@endcredits-demo/moved-payout` → registry 404 → declared
  `zexoverz/endcredits-fixture-moved-payout` → `repoPublishes` true (false for another name) →
  `0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551` from `FUNDING.json` (drips).

## Intercepta: no history is not an error (26 Sep)

- **Why:** quick-scan answers HTTP 404 with `errors[].message` "An Externally Owned Account with this
  address doesn't exist." for an address it has never seen on mainnet (probe on `e4-probe`). We
  treated every non-200 as `HTTP`, so a fresh payee held as `SCREEN_UNAVAILABLE` (or fell back to
  simulation) and a new passkey wallet failed the claim screen.
- **Client:** `lib/intercepta/no-history.ts` matches only that case: status 404 and an error message
  containing "Externally Owned Account" and "doesn't exist", case-insensitive. The quick scan then
  returns `{ toxicScore: 0, traits: [], noHistory: true }`, no simulation fallback. The row is stored
  with status 404 and the raw body, so it stays auditable. Any other 404 or error is still an error.
  Other routes never read the 404 this way.
- **Reuse:** a no-history row counts as a successful address screen for the 5 min cache and for the
  x402 freshness check (`latestAddressScreenAt` takes the newer of a 200 and a no-history 404).
- **Matrix:** after medium, before no-code: `noHistory` → held `HELD_NO_HISTORY`, `holdReason`
  `MEDIUM` (on-chain 2). A changed fresh address stays `HELD_CHANGED`; refusals and medium still win.
  Never paid unscreened.
- **Claims:** a no-history wallet is accepted (new passkey wallets are fresh). Critical traits and a
  score above 50 still refuse; a real error still fails closed.
- **Known gap:** the probe's ScamSniffer phishing receiver `0x3da0…e155` also has no history. As a
  payee it holds; as a claim wallet it would pass the screen. The claim is still gated by repo
  write access and the funding file.
- Live check, 26 Sep (script not committed, nothing stored): `0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551`
  (moved-payout address A) now answers **200** `{toxicScore: 0, traits: []}`, not the 404, so it is a
  normal clean screen. `0x3da02e1f29bcbed185eca0d3299efd46e6e7e155` answers the 404, and the client
  returns `noHistory: true` with the raw body stored at status 404.

## Intercepta: one retry on timeouts (26 Sep)

- **Why:** in a production settlement the impersonation check timed out once at 8 s
  (`{"error":"TIMEOUT"}` in `screens`) while the quick scan for the same address answered 200 clean in
  about 1 s. The payee held as `SCREEN_UNAVAILABLE`. Holding was right (AGENTS rule 7), but one slow
  request should not decide a payee.
- **Rule:** every Intercepta call (quick scan, impersonation, token risks, simulation) retries once,
  after 500 ms (`RETRY_DELAY_MS`, `retryDelayMs` in tests), on a timeout, a network error, a 5xx or a
  429 (`transient` in `lib/intercepta/http.ts`). No retry on any other 4xx, including the no-history
  404, or on a body that fails to parse. Each attempt keeps its own 8 s deadline.
- **Audit:** both attempts are stored in `screens`, the failed one with its error body. Only the last
  attempt decides, and its row id is the one returned.
- **Still failing:** unchanged. `Screen.error` is set and the payee holds as `SCREEN_UNAVAILABLE`.
  Never paid without both screens.
- **Latency:** quick scan, impersonation and token risks already ran in parallel in `screenPayee`, so
  the worst case for that step is about 16.5 s rather than 8 s, and only when a call fails. The
  simulation fallback after a failed quick scan can add the same again.
- **Budget:** requests double only on failures.

## Intercepta: simulate the payment, screen the payer (26 Sep)

- **Why:** Intercepta's prize asks the paying agent to screen the payment authorization itself, and
  the paid service to screen the payer's wallet. We already screened `payTo` and the token.
- **API, confirmed** from `https://docs.web3antivirus.io/reference/scan-transaction.md` (26 Sep):
  `POST /api/public/v1/extension/simulation/transaction?chainId=8453`, body
  `{transaction: {from, to, value, data, gas?, gasPrice?}, mode: "short"}` (also `url`,
  `transactionHash`). Short response `{to, from, detectors: [{code, description}], assetsMovement:
  {send: [{symbol, address, type, amount}], receive: [...]}, transactionType}`. `amount` is a
  decimal string in token units (`"0.25"`), and the movement is from `from`'s side only; it does
  not name the recipient. There is **no documented option to simulate regardless of balance**.
- **Live, 4 requests** (key from `~/.config/dominion/intercepta-key`, never printed),
  `USDC.transfer(0xF233…Eeb87, 250000)` on Base USDC:
  1. from the payer `0xaf4C…9Bb6` → **HTTP 400** `{"errors":[{"message":"There are not enough funds
     to perform this transaction"}]}`. The payer holds USDC only on Base Sepolia.
  2. from `0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A` (a Base EOA with 79,178 USDC and 39,057 ETH
     on 26 Sep, read with `balanceOf`/`getBalance` on `mainnet.base.org`) → 200,
     `send: [{USDC, 0x8335…2913, "0.25"}]`, `receive: []`, `transactionType: "transfer"`,
     detectors `[WALLET_DRAINER "If you sign this transaction, you will send tokens or grant
     approval to a scam address."]`.
  3. same sender, prettier's payee `0x3A39…3141` → the same `WALLET_DRAINER`. It fires for two clean
     payees (both quick-scan `{toxicScore: 0, traits: []}` in the T4.1 probe), so it describes this
     sender or the call pattern, not the recipient. It is not in the refuse-on-sight set and does
     not refuse; it is stored verbatim in the `screens` row.
  4. through `scripts/simulate-payment.ts` (the client, nothing stored): the same answer, parsed,
     and the credit stays `paid` with `SIMULATED`.
- **Choice: simulate from that funded holder, same recipient and amount.** `SIMULATION_FROM` in
  `lib/intercepta/client.ts`. The row's `mapped_from` says so:
  `eip155:84532/0x036c…cf7e; payer 0xaf4c…9bb6 simulated as 0x3304…566a`. Cache key
  `(simulation, "<payee>/<amount>", 8453)`, so only the same payment reuses a row (1 h).
- **When:** in `decideAndExecute`, after the matrix and only for `paid`/`capped`, one simulation per
  credit (`simulatePayment` dep). The result is folded into the decision by `applySimulation`
  (`lib/decision/simulation.ts`) before `recordDecision`, so the stored decision already carries it
  when the x402 client signs (AGENTS rule 6).
- **Rules:** a detector in `CRITICAL` (matrix) → `refused`, `REFUSED_SIMULATION` per detector.
  `assetsMovement` other than exactly one send of Base USDC equal to the amount and no receive →
  `held` (`holdReason` `SCREEN`), `HELD_SIMULATION` with what moved (`-0.5 USDC`, `nothing`, or
  `an unreadable asset movement`). Error or timeout after the one retry, or a throw → `held`,
  `SCREEN_UNAVAILABLE`. Clean → `SIMULATED` appended. The simulation `screens` id joins the credit's
  `screen_ids`. x402 `exact` settles by `transferWithAuthorization`, whose balance effect is this
  same transfer; the `SIMULATED` text says so.
- **Payer screen (paid side):** `handleCreditRequest` reads `payload.authorization.from` after the
  challenge match and before `verify`. Not an address → 400 `INVALID_PAYMENT`. Quick scan through
  the Intercepta client (5 min address cache, `mapped_from` `eip155:84532 x402 payer`; a cached row
  keeps the note it was stored with). Its id is appended once to `credits.screen_ids`
  (`addScreenId`). A `CRITICAL` trait or `toxicScore > 50` → 403 `{code: "PAYER_REFUSED", message}`;
  an error → 503 `{code: "PAYER_SCREEN_UNAVAILABLE", message}`; neither reaches the facilitator.
  No history → accepted (fresh payer wallets are normal), the 404 row is still recorded.
- **Budget:** one simulation per paid credit, one payer quick scan per payer per 5 min.
- **Gap:** the settler's x402 client maps our 403/503 to `EXECUTION_FAILED`, not a named refusal.

**Simulation off by default.** Intercepta's simulation only runs with the sender's real mainnet
balance; our payer holds testnet USDC only. Simulating from a substituted mainnet wallet returned a
`WALLET_DRAINER` detector on a plain transfer to a payee that scans clean, a signal about the
substituted sender, not our payment. Showing it would mislead, so the settler runs the simulation
only when `SIMULATE_PAYMENTS=true` (for a mainnet payer). Screening the x402 payer on the paid side
stays on. This is also API feedback: simulation cannot cover a testnet agent's payment, and
signature analysis does not cover EIP-3009 `TransferWithAuthorization`, the message x402 signs.
## Risk profile and dashboard actions (26 Sep)

- **`GET /api/risk/<address>`** (`lib/risk/profile.ts`) reads only our DB: `screens`,
  `payee_observations`, `credits`. No Intercepta call, so a page view costs no API quota and cannot
  hold anything up. Latest verdict per kind is the newest reusable row (200, or the no-history 404);
  failed calls count in `screens.count` but are never a verdict. Addresses are matched with
  `lower()` because `credits.payee` and observations are stored checksummed. A checksum that does not
  validate is a 400; an address we never saw is an empty 200.
- **`payeeOf[].addresses`** lists every address the package ever named, so a moved payout shows both
  sides whichever address is asked about. `current` is the package's latest observation.
- **`/api/npm/<name>` `payeeRisk`**: the same profile for the resolved payee, through an optional
  `ClaimDeps.riskOf`. A failed read reports `errors: ["risk"]` and `null`, like `chain` and `payee`.
- **Dashboard `actions`**: pending holds are Held tips with no Released/Refunded row in
  `held_status`, expiry from `Held.expiresAt` (the `detail` column). A hold past its expiry is left
  out: `release` would revert `TipExpired`. Warnings (expiry within 2 h) first, then holds by soonest
  expiry, then reserves > 0 largest first. Titles are three new message codes (`ACTION_APPROVE`,
  `ACTION_EXPIRING`, `ACTION_RESERVE`), 52 codes now.
- **Dashboard `timeline`**: 48 UTC hours. `paid` from `paid_totals` (escrow excluded, as the card);
  the escrow series from `recent`, which now pages on while its last row is inside the window
  instead of stopping at 50. `held_status` has no `triggered_at`, and changing a saved query means a
  re-run of `multibaas-setup.ts`, so `recent` was the one query to extend. Same 6 calls per refresh
  unless more than 50 escrow events happened in 48 h.
- `triggered_at` is Postgres text (`2026-09-26 10:38:38+00`); `parseTriggeredAt` reads it and ISO.
- Live check, 26 Sep (read-only, 10 MultiBaas calls in total, no DB): `held_status` 8 rows (4 tips,
  all resolved, so no hold actions), `reserved_by_package` 3 packages at 0.25 USDC each (3
  `reserve_waiting` actions), `paid_totals` 0 rows on v2. Timeline hour 10:00 UTC: held 0.75,
  released 0.25, refunded 0.5, reserved 0.75, matching the raw rows. The dashboard build made 6 calls.

## MultiBaas address filters are case-sensitive (26 Sep)

`paid_totals` returned 0 rows although the x402 payments were indexed: MultiBaas stores event
address inputs in lowercase and compares filter values as strings. Filtering on the checksummed
payer matched nothing; the lowercase payer matches. The saved query is re-saved by
`scripts/multibaas-setup.ts`.

## Wallet sign-in (26 Sep)

World is no longer a partner, and the dev token reads as a dev tool. The owner already holds one
wallet as the escrow v2 approver and will use it as the budget wallet, so that wallet is the sign-in:
SIWE (EIP-4361) through `viem/siwe`.

- **Binding rule.** `owners.wallet_address` (unique) is set on the first wallet sign-in, and only when
  the owner row has no wallet yet AND the address equals the owner's current on-chain approver
  (`approverOf(payer)`), or no approver is set. Later sign-ins must be that wallet (`wrong_wallet`
  otherwise). The bind is a conditional update (`where wallet_address is null`), so two first
  sign-ins racing cannot both bind. An unbound wallet binds to the first owner row, the same owner
  the dev token signs in as (one owner per deployment). A failed approver read refuses to bind
  (`chain_error`) rather than binding blind.
- **Nonce.** Generated by `generateSiweNonce`, stored in the `ec_owner` iron-session cookie with a
  10 minute expiry and cleared on the sign-in attempt. The cookie alone is not single use (an old
  cookie can be replayed), so a used nonce is also written to `siwe_nonces` and a second use is
  `bad_nonce`. The row is written before the signature check, so a failed attempt also spends it.
- **Checks.** `domain` equals the host of `APP_URL`, `uri` origin equals `APP_URL`'s origin, `chainId`
  84532 (all `bad_domain`); `issuedAt` present, not older than 10 min, not more than 1 min ahead;
  `expirationTime` not passed; `notBefore` reached (all `expired`). The signature is checked with
  `publicClient.verifySiweMessage`, which covers EOA, ERC-1271 and ERC-6492, so a passkey wallet not
  yet deployed signs in too. Tests use viem's offline `verifyMessage` (real ecrecover, EOA only)
  through the injected `verify`.
- **Methods.** `GET /api/auth/methods` → `{wallet: true, dev, world}`; `dev` is
  `!WORLD_REQUIRED && OWNER_DEV_TOKEN`, `world` is `WORLD_SIGNIN === "true"` (off by default). The
  World routes stay in the tree but the UI drops the button. `POST /api/auth/dev` is unchanged.
- **Onboarding.** `GET /api/owner/onboarding` lists seven steps in a fixed order with `next` = the
  first not done. `spend_allowance` is a placeholder (`"coming soon"`) until `BUDGET_ADDRESS` is set;
  then `readSpendAllowance()` in `lib/owner/onboarding.ts` decides it, a stub returning null for now
  that the budget contract change fills in. A failed approver read shows `approver_set` not done with
  `"chain unavailable"`, never an error for the whole list.
## EndCreditsBudget (spend limits)

**Why.** The payer key that holds the USDC budget lives on our server, so a compromised server can
spend all of it. `EndCreditsBudget` moves the money to the owner's own wallet (any EOA, or a smart
wallet) and lets the server's agent key pull only up to a cap per period. The owner approves the
contract on USDC once and calls `setAllowance(agent, perPeriod, period)`; the agent calls
`pull(owner, amount)` and the USDC goes straight from the owner to the agent. The contract never
holds funds, has no admin, no owner and no upgrade path.

- **Allowance per (owner, spender).** `setAllowance` is called by the owner. `ZeroSpender`,
  `PeriodOutOfRange(period)` outside `[1 hours, 30 days]`, `ZeroAmount` on a zero cap. A new
  allowance, or a different period length, starts a fresh window at `now` with nothing spent. The
  same period with another cap keeps the window and the spent amount, so lowering the cap (or
  re-saving settings) never resets what was spent; spent can then exceed the new cap and nothing
  is left until the window ends. `revoke(spender)` deletes the allowance; a later `setAllowance`
  starts fresh. A missing allowance has `period == 0`, so the one `a.period != period` check covers
  both cases.
- **`pull`** checks `NoAllowance(owner, spender)`, then `ZeroAmount`, then the cap:
  `OverPeriodCap(remaining)` with the exact amount left. The comparison is `amount > left`, so a
  `type(uint256).max` amount reverts with the cap error and never overflows. State is written, then
  `Pulled(owner, spender, amount, spentInPeriod, periodStart)`, then `safeTransferFrom`. A missing
  or short USDC approval or balance reverts with OZ's `ERC20InsufficientAllowance` /
  `ERC20InsufficientBalance`, and the state write reverts with it.
- **Windows.** Once `now >= periodStart + period`, `periodStart` moves forward by whole periods
  (`start + floor((now - start) / period) * period`) and spent resets. Windows stay on the grid of
  the first one, whenever the pull lands. The roll is lazy: `remaining(owner, spender)` applies it in
  the view, `allowanceOf` returns storage as it is.
- **Threat model: a stolen spender key.** It can pull what is left in the current window, and then
  up to `perPeriod` in each later window until the owner revokes, always to the spender's own
  address. Because windows are fixed, a thief who pulls at the end of one window and again at the
  start of the next takes up to `2 x perPeriod` in a short span; that is the worst burst. It cannot
  raise its cap, change the period, undo a revoke, pull from an owner who did not name it, use
  another spender's allowance, touch any token but the pinned USDC, or take more than the owner's
  USDC approval to this contract or the owner's balance. The owner has two kill switches, each one
  tx and neither needing our server: `revoke(agent)` here, or `approve(budget, 0)` on USDC. A
  stolen owner key is out of scope: it controls the money directly anyway.
- **Owner setup.** Two calls: `usdc.approve(budget, amount)` and `setAllowance(agent, cap,
  period)`. A smart wallet can batch them; an EOA sends two txs. The USDC approval is shared by all
  of that owner's spenders; each spender is still held to its own allowance.
- Gas (forge `--isolate`, call gas, OZ `ERC20` mock): `setAllowance` 49,532 (new), `pull` 85,433
  for the first pull (spender's USDC balance from zero), 51,233 for a later pull in the same window,
  54,443 for a pull that rolls the window. Real USDC is a proxy and costs more.
- **Deploy** (not yet deployed): `contracts/script/DeployBudget.s.sol`, env `USDC_ADDRESS`; with
  `MULTIBAAS_URL` set and `--broadcast` it links the address as `endcredits_budget` `1.0` at alias
  `budget`, same rules as `Deploy.s.sol`. `budgetAbi` is in `lib/chain/abi.ts`.

### EndCreditsBudget mutation pass

Each row: the guard deleted (or the value swapped) in `contracts/src/EndCreditsBudget.sol`, then
`forge test --match-path 'test/EndCreditsBudget*'`, then the source restored (scripted, the file
rewritten from the saved original). Run on 2026-09-26; `git diff` on `src/` was clean afterwards.
An earlier run found one surviving mutant: `a.perPeriod == 0 ||` in the reset condition was
redundant (a missing allowance already has `period == 0`), so it was removed from the contract.

| setAllowance: `ZeroSpender` | `test_setAllowance_revertsOnZeroSpender` |
| setAllowance: `PeriodOutOfRange` (whole check) | `test_setAllowance_revertsOnPeriodTooLong`, `test_setAllowance_revertsOnPeriodTooShort` |
| setAllowance: `PeriodOutOfRange` (MIN side only) | `test_setAllowance_revertsOnPeriodTooShort` |
| setAllowance: `PeriodOutOfRange` (MAX side only) | `test_setAllowance_revertsOnPeriodTooLong` |
| setAllowance: `ZeroAmount` | `test_setAllowance_revertsOnZeroAmount` |
| setAllowance: fresh window on a new allowance or new period (branch removed) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_allowancesAreSeparatePerSpender`, `test_pull_exactCapThenNothingLeft`, `test_pull_movesFundsWithinCap`, `test_pull_revertsAfterRevoke`, `test_pull_revertsOnHugeAmountWithoutOverflow`, `test_pull_revertsOverCapOnFirstPull`, `test_pull_revertsOverCapWithRemaining`, `test_pull_revertsWithoutUsdcApproval`, `test_pull_revertsWithoutUsdcBalance`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge`, `test_remaining_accountsForRolledWindow`, `test_revoke_deletesAndEmits`, `test_revoke_onlyTouchesCallersAllowance`, `test_setAllowance_acceptsPeriodBounds`, `test_setAllowance_afterRevokeStartsFresh`, `test_setAllowance_loweringCapKeepsSpent`, `test_setAllowance_periodChangeResets`, `test_setAllowance_raisingCapKeepsWindow`, `test_setAllowance_storesAndEmits` |
| setAllowance: period change resets (only a new allowance does) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `test_setAllowance_acceptsPeriodBounds`, `test_setAllowance_periodChangeResets` |
| setAllowance: cap change keeps spent (swapped to always reset) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `test_setAllowance_loweringCapKeepsSpent`, `test_setAllowance_raisingCapKeepsWindow` |
| revoke: `delete` | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `invariant_spendersHoldExactlyWhatWasPulled`, `test_pull_revertsAfterRevoke`, `test_revoke_deletesAndEmits`, `test_setAllowance_afterRevokeStartsFresh` |
| pull: `NoAllowance` | `test_pull_revertsAfterRevoke`, `test_pull_revertsForOtherSpender`, `test_pull_revertsFromOwnerWhoNeverSetOne`, `test_pull_revertsWithoutAllowance` |
| pull: `ZeroAmount` | `test_pull_revertsOnZeroAmount` |
| pull: `OverPeriodCap` | `invariant_pullsMatchTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_allowancesAreSeparatePerSpender`, `test_pull_exactCapThenNothingLeft`, `test_pull_revertsOnHugeAmountWithoutOverflow`, `test_pull_revertsOverCapOnFirstPull`, `test_pull_revertsOverCapWithRemaining`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge`, `test_setAllowance_loweringCapKeepsSpent`, `test_setAllowance_raisingCapKeepsWindow` |
| pull: `OverPeriodCap` `>` swapped to `>=` | `invariant_pullsMatchTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_allowancesAreSeparatePerSpender`, `test_pull_exactCapThenNothingLeft`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge`, `test_remaining_accountsForRolledWindow`, `test_setAllowance_afterRevokeStartsFresh`, `test_setAllowance_periodChangeResets`, `test_setAllowance_raisingCapKeepsWindow` |
| pull: spent written before transfer (removed) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_allowancesAreSeparatePerSpender`, `test_pull_exactCapThenNothingLeft`, `test_pull_movesFundsWithinCap`, `test_pull_revertsOnHugeAmountWithoutOverflow`, `test_pull_revertsOverCapWithRemaining`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge`, `test_remaining_accountsForRolledWindow`, `test_setAllowance_loweringCapKeepsSpent`, `test_setAllowance_raisingCapKeepsWindow` |
| pull: window start written (removed) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge` |
| pull: pays the caller (swapped to `address(this)`) | `invariant_contractHoldsNoUsdc`, `invariant_spendersHoldExactlyWhatWasPulled`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_allowancesAreSeparatePerSpender`, `test_pull_movesFundsWithinCap`, `test_pull_rollsAfterOnePeriod` |
| pull: allowance keyed by caller (swapped to `owner`) | `invariant_pullsMatchTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_allowancesAreSeparatePerSpender`, `test_pull_exactCapThenNothingLeft`, `test_pull_movesFundsWithinCap`, `test_pull_revertsAfterRevoke`, `test_pull_revertsOnHugeAmountWithoutOverflow`, `test_pull_revertsOnZeroAmount`, `test_pull_revertsOverCapOnFirstPull`, `test_pull_revertsOverCapWithRemaining`, `test_pull_revertsWithoutUsdcApproval`, `test_pull_revertsWithoutUsdcBalance`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge`, `test_remaining_accountsForRolledWindow`, `test_revoke_deletesAndEmits`, `test_revoke_onlyTouchesCallersAllowance`, `test_setAllowance_afterRevokeStartsFresh`, `test_setAllowance_loweringCapKeepsSpent`, `test_setAllowance_periodChangeResets`, `test_setAllowance_raisingCapKeepsWindow` |
| _window: roll at the edge, `>=` swapped to `>` | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge` |
| _window: whole periods (swapped to `start = now`, drifts) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift` |
| _window: spent reset on roll (removed) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge`, `test_remaining_accountsForRolledWindow` |
| _window: roll (branch removed) | `invariant_pullsMatchTheModel`, `invariant_remainingMatchesTheModel`, `testFuzz_pullsInOneWindowNeverExceedCap`, `test_pull_rollsAfterOnePeriod`, `test_pull_rollsAfterSeveralPeriodsWithoutDrift`, `test_pull_windowEdge`, `test_remaining_accountsForRolledWindow` |
| _left: clamp at zero (removed) | `invariant_remainingMatchesTheModel`, `test_setAllowance_loweringCapKeepsSpent` |
| remaining: zero for a missing allowance (short-circuit removed) | `invariant_remainingMatchesTheModel`, `test_remaining_zeroWithoutAllowance`, `test_revoke_deletesAndEmits` |

**Deployed (26 Sep):** `EndCreditsBudget` at `0x1429498c0e6f2f474a5bd3230e79a838e3590b36` on Base
Sepolia, verified on Sourcify (`exact_match`) and Basescan, linked in MultiBaas as `budget`. A first
deployment at `0xd35cb8b89a219df7320eb0e9b47969cc709cc5c5` was built from a stale artifact (21 bytes
longer, before the redundant check was removed), could not be verified against the final source, and
is not used.
