// Production chain for approve and deny: recorder-signed `release` (after deploying a counterfactual
// ERC-6492 approver wallet when needed) and `refund` on EndCreditsEscrow, and the off-chain
// signature check (`verifyTypedData` handles EOA, ERC-1271 and ERC-6492).
import { deployErc6492Wallet, refund, release } from "../chain/escrow";
import { chain } from "../chain/keys";
import type { ApproveDeps } from "./handlers";

export function defaultApproveDeps(): ApproveDeps {
  return {
    chain: {
      release: async ({ approver, signature, ...a }) =>
        release({ ...a, signature: await deployErc6492Wallet(approver, signature) }),
      refund: (tipId) => refund(tipId),
      releaseDomain: () => ({ escrow: chain().escrow, chainId: chain().publicClient.chain.id }),
      verifyRelease: (approver, typedData, signature) =>
        chain().publicClient.verifyTypedData({ address: approver, ...typedData, signature }),
    },
  };
}
