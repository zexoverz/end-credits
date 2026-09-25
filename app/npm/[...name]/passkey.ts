// The passkey wallet: Base Account SDK (now Coinbase Wallet), loaded only when the button is
// pressed. API confirmed in docs/plan/decisions.md (E10 frontend).
import type { ProviderInterface } from "@base-org/account";
import { baseSepolia } from "viem/chains";
import { firstAccount } from "@/lib/client/claim";

let provider: ProviderInterface | null = null;

export async function connectPasskey(): Promise<string | null> {
  if (!provider) {
    const { createBaseAccountSDK } = await import("@base-org/account");
    provider = createBaseAccountSDK({ appName: "End Credits", appChainIds: [baseSepolia.id] }).getProvider();
  }
  return firstAccount(await provider.request({ method: "eth_requestAccounts" }));
}
