// Production chain for approve and deny: recorder-signed `release` and `refund` on EndCreditsEscrow.
import { refund, release } from "../chain/escrow";
import type { ApproveDeps } from "./handlers";

export function defaultApproveDeps(): ApproveDeps {
  return {
    chain: {
      release: (tipId, approvalRef) => release(tipId, approvalRef),
      refund: (tipId) => refund(tipId),
    },
  };
}
