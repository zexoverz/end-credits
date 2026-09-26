// The claim wallet's Intercepta quick scan. A wallet with no mainnet history (the no-history 404)
// comes back ok with a clean score: new passkey wallets are expected to be fresh (decisions.md,
// 26 Sep). A real error stays `ok: false` and the claim fails closed.
import type { Address } from "viem";
import type { Intercepta } from "../intercepta/client";
import type { WalletScreen } from "./deps";

export async function quickScanWallet(intercepta: Pick<Intercepta, "quickScan">, address: Address): Promise<WalletScreen> {
  const r = await intercepta.quickScan(address);
  if (!r.ok) return { ok: false, error: r.error, screenId: r.screenId };
  return { ok: true, toxicScore: r.data.toxicScore, traits: r.data.traits, screenId: r.screenId };
}
