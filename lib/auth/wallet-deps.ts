// Production deps for wallet sign-in: the Base Sepolia public client checks the SIWE signature (EOA,
// ERC-1271, ERC-6492), the escrow names the payer's approver, and a new owner gets a derived payer.
import { approverOf } from "../chain/escrow";
import { chain } from "../chain/keys";
import { payerAddressFor } from "../chain/payers";
import type { WalletAuthDeps } from "./wallet";

export function defaultWalletDeps(): WalletAuthDeps {
  return {
    verify: ({ address, message, signature }) =>
      chain().publicClient.verifySiweMessage({ address, message, signature }),
    approverOf: (payer) => approverOf(payer),
    newPayer: (ownerId) => payerAddressFor(ownerId),
  };
}
