// Production deps for wallet sign-in: the Base Sepolia public client checks the SIWE signature (EOA,
// ERC-1271, ERC-6492) and the escrow names the payer's approver.
import { approverOf } from "../chain/escrow";
import { chain } from "../chain/keys";
import type { WalletAuthDeps } from "./wallet";

export function defaultWalletDeps(): WalletAuthDeps {
  return {
    verify: ({ address, message, signature }) =>
      chain().publicClient.verifySiweMessage({ address, message, signature }),
    approverOf: (payer) => approverOf(payer),
  };
}
