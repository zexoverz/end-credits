# Where the money is: escrow and budget

## Held money: the owner signs the release, on chain

A `held` credit sits in `EndCreditsEscrow` v2 until the owner decides. Our server cannot release it
alone: `release` needs an EIP-712 signature from the owner's approver wallet, checked by the
contract.

| Rule | Where |
|---|---|
| Each payer names an approver wallet with `setApprover`. The first set is immediate; any later change waits `changeDelay` (3 days) and is public as `ApproverSet` meanwhile | [`contracts/src/EndCreditsEscrow.sol#L117-L133`](../contracts/src/EndCreditsEscrow.sol#L117-L133) |
| `release(tipId, approvalRef, deadline, signature)` is sent by the recorder, but reverts `BadApproval` unless the payer's current approver signed it (ECDSA or ERC-1271) | [`#L163-L184`](../contracts/src/EndCreditsEscrow.sol#L163-L184) |
| The signed struct binds the stored payee and amount, the tip, a deadline and the escrow's domain, so a signature cannot move other money | [`#L272-L277`](../contracts/src/EndCreditsEscrow.sol#L272-L277) |
| The payer can refund its own pending tip at any time (a deny without our server); anyone can after expiry | [`#L189`](../contracts/src/EndCreditsEscrow.sol#L189) |

The flow on `/approve/<tipId>`: `POST /api/approve/:tipId/prepare` returns typed data rebuilt from
our rows ([`lib/approve/typed-data.ts`](../lib/approve/typed-data.ts)); the owner signs it with MetaMask
or a Base Account passkey wallet ([`components/approver/sign-release.tsx`](../components/approver/sign-release.tsx),
[`components/approver/connect-wallet.tsx`](../components/approver/connect-wallet.tsx)); the server checks
the signature against the stored approver ([`lib/approve/signed.ts`](../lib/approve/signed.ts)); then the
recorder submits `release` with it ([`lib/approve/actions.ts#L91-L104`](../lib/approve/actions.ts#L91-L104)).
The owner names the approver on `/owner` ([`components/approver/set-approver.tsx`](../components/approver/set-approver.tsx)).

Live on 26 Sep: the `@endcredits-demo/moved-payout` hold in the session above was released with the
owner's MetaMask signature. With a throwaway payer, a release signed by the wrong key reverted
`BadApproval` and the approver-signed release
[`0xd8c70875…`](https://sepolia.basescan.org/tx/0xd8c7087528872b003879e215d7b515e46b20d6728ec26a28f28d9684c648d95d)
paid. Design and the mutation table: [`docs/plan/decisions.md`](plan/decisions.md) (Escrow v2).

## Money never sits on our server

The owner's USDC stays in the owner's own wallet. `EndCreditsBudget`
([`0x1429498C0E6F2f474a5BD3230e79a838E3590b36`](https://sepolia.basescan.org/address/0x1429498c0e6f2f474a5bd3230e79a838e3590b36#code),
Sourcify `exact_match`) lets our agent key pull at most a per-period cap from it. The contract never
holds funds and has no admin, no owner and no upgrade path
([`contracts/src/EndCreditsBudget.sol`](../contracts/src/EndCreditsBudget.sol)).

| Step | Who | Where |
|---|---|---|
| `usdc.approve(budget, amount)` and `setAllowance(agent, perPeriod, period)`, sent from the owner's wallet in the browser | owner | [`#L49-L64`](../contracts/src/EndCreditsBudget.sol#L49-L64), [`components/budget/budget-wallet.tsx`](../components/budget/budget-wallet.tsx) |
| The session budget is `min(session budget, daily limit left, remaining(owner, agent))`, read before the split; a zero on-chain remaining makes every share `BUDGET_CAP` dust | settler | [`lib/settle/settle.ts#L92-L101`](../lib/settle/settle.ts#L92-L101) |
| Every decision is stored, then one `pull(owner, need)` of exactly what will be paid, held or reserved, then the payments | settler | [`lib/settle/settle.ts#L206-L230`](../lib/settle/settle.ts#L206-L230), [`lib/chain/budget.ts`](../lib/chain/budget.ts) |
| A refused pull (`OverPeriodCap`, `NoAllowance`, short approval or balance) moves nothing; each credit keeps its decision and gets `BUDGET_PULL_FAILED` with the revert name | settler | [`#L224-L230`](../lib/settle/settle.ts#L224-L230) |
| `revoke(agent)`, one tx, no server involved (or `approve(budget, 0)` on USDC) | owner | [`#L67-L70`](../contracts/src/EndCreditsBudget.sol#L67-L70) |

If the agent key is stolen:

- it can pull at most what is left of the cap, then `perPeriod` per window until the owner revokes;
  windows are fixed, so the worst burst is `2 x perPeriod` across a window edge;
- it cannot raise its cap, change the period, undo a revoke, pull from an owner who did not name it,
  use another spender's allowance, or touch any token but the pinned USDC;
- the pulled USDC goes only to the agent key itself ([`#L74-L89`](../contracts/src/EndCreditsBudget.sol#L74-L89)).

35 Foundry tests, including 4 invariants against a model, in
[`contracts/test/EndCreditsBudget.t.sol`](../contracts/test/EndCreditsBudget.t.sol) and
[`EndCreditsBudget.invariant.t.sol`](../contracts/test/EndCreditsBudget.invariant.t.sol). Every guard was
deleted or swapped in turn and a named test failed each time (mutation table in
[`docs/plan/decisions.md`](plan/decisions.md), EndCreditsBudget mutation pass). The settle
integration runs on anvil against MockUSDC, the budget and the escrow
([`lib/settle/settle.budget.anvil.test.ts`](../lib/settle/settle.budget.anvil.test.ts)).

Together with escrow v2 this is the policy an agent cannot talk its way past: session budget,
per-package cap and daily limit in the split, the on-chain spend cap in `EndCreditsBudget`, the
Intercepta screen before anything is signed, and the owner's signature for held money.

Without `BUDGET_ADDRESS`, or for an owner with no budget wallet, the agent key pays from its own
balance as before.
