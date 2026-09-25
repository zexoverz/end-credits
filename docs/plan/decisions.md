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
