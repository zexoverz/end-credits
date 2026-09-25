# Decisions made during the build

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
