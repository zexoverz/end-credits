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
