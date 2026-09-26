// Production wiring for payer provisioning: the master key tops up gas through the shared tx queue,
// and each owner's payer key names its approver and approves the escrow.
import { allowance, approveEscrow, approverOf, queueFor, setApprover } from "../chain/escrow";
import { chain } from "../chain/keys";
import { chainForOwner } from "../chain/payers";
import type { ProvisionDeps } from "./provision";

export function defaultProvisionDeps(log?: (line: string) => void): ProvisionDeps {
  const master = chain();
  return {
    master: master.payer.account.address,
    ethBalance: (address) => master.publicClient.getBalance({ address }),
    fundGas: (to, value) =>
      queueFor(master).submit(master.payer.account.address, { to, data: "0x", value, functionName: "fundGas" }),
    approverOf: (payer) => approverOf(payer),
    setApprover: (owner, approver) => setApprover(approver, chainForOwner(owner)),
    escrowAllowance: (payer) => allowance(payer),
    approveEscrow: (owner, amount) => approveEscrow(amount, chainForOwner(owner)),
    log,
  };
}
