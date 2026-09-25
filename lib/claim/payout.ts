// After the funding file is verified: screen the wallet, then the recorder moves every reserve of
// the repo to it (DESIGN §13). Nothing reaches the chain unless the screen came back clean.
import { keccak256, stringToBytes, type Address, type Hash, type Hex } from "viem";
import { TxRevertedError } from "../chain/txqueue";
import { CRITICAL, REFUSE_ABOVE } from "../decision/matrix";
import type { ClaimDeps, WalletScreen } from "./deps";
import type { PackageRow } from "./store";

export function evidenceOf(repo: string, sha: string): Hex {
  return keccak256(stringToBytes(repo + sha));
}

// The reason to refuse this wallet, or null when it may receive funds.
export function refusalOf(s: Extract<WalletScreen, { ok: true }>): string | null {
  const critical = s.traits.filter((t) => CRITICAL.has(t.name));
  if (critical.length > 0) return critical.map((t) => t.description).join("; ");
  if (s.toxicScore > REFUSE_ABOVE) {
    return s.traits.length > 0 ? s.traits.map((t) => t.description).join("; ") : `toxic score ${s.toxicScore}`;
  }
  return null;
}

export async function screenWallet(wallet: Address, deps: ClaimDeps): Promise<WalletScreen> {
  try {
    return await deps.screen(wallet);
  } catch (e) {
    // A missing INTERCEPTA_API_KEY lands here: fail closed.
    return { ok: false, error: e instanceof Error && /Missing required env/.test(e.message) ? "not configured" : "error" };
  }
}

export type Payout = {
  setClaimTxs: Hash[];
  claimTxs: Hash[];
  claimed: bigint;
  coolingUntil: bigint | null; // unix seconds, when a reserve is blocked by ClaimCoolingDown
};

export async function payOut(
  packages: PackageRow[],
  wallet: Address,
  evidence: Hex,
  deps: ClaimDeps,
): Promise<Payout> {
  const out: Payout = { setClaimTxs: [], claimTxs: [], claimed: 0n, coolingUntil: null };
  for (const p of packages) {
    const key = p.packageKey as Hex;
    const amount = await deps.chain.reserved(key);
    if (amount === 0n) continue;
    const state = await deps.chain.claimState(key);
    if (state.payee.toLowerCase() !== wallet.toLowerCase()) out.setClaimTxs.push(await deps.chain.setClaim(key, wallet, evidence));
    try {
      out.claimTxs.push(await deps.chain.claim(key));
      out.claimed += amount;
    } catch (e) {
      if (!(e instanceof TxRevertedError)) throw e;
      if (e.errorName === "NothingReserved") continue; // a concurrent check claimed it first
      if (e.errorName !== "ClaimCoolingDown") throw e;
      const s = await deps.chain.claimState(key);
      const until = s.changedAt + (await deps.chain.changeDelay());
      out.coolingUntil = out.coolingUntil === null || until > out.coolingUntil ? until : out.coolingUntil;
    }
  }
  return out;
}
