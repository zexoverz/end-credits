// Test-only fakes for the claim flow: an in-memory escrow that follows EndCreditsEscrow's claim
// rules (DESIGN §16), and a scripted wallet screen. Product code always uses the real chain and
// the real Intercepta client.
import { keccak256, stringToBytes, zeroAddress, type Address, type Hex } from "viem";
import { TxRevertedError } from "../../chain/txqueue";
import type { ClaimChain, ClaimOnChain, WalletScreen } from "../deps";

export const CHANGE_DELAY = 3n * 86400n;

export function fakeChain(nowSeconds: () => bigint = () => 1_800_000_000n) {
  const reserved = new Map<Hex, bigint>();
  const claims = new Map<Hex, ClaimOnChain>();
  const calls: { fn: "setClaim" | "claim"; key: Hex; payee?: Address; evidence?: Hex }[] = [];
  let n = 0;
  const tx = () => keccak256(stringToBytes(`tx${n++}`));

  const chain: ClaimChain = {
    async reserved(key) {
      return reserved.get(key) ?? 0n;
    },
    async claimState(key) {
      return claims.get(key) ?? { payee: zeroAddress, changedAt: 0n, changed: false };
    },
    async changeDelay() {
      return CHANGE_DELAY;
    },
    async setClaim(key, payee, evidence) {
      calls.push({ fn: "setClaim", key, payee, evidence });
      const prev = claims.get(key);
      const isChange = !!prev && prev.payee !== zeroAddress && prev.payee !== payee;
      claims.set(key, {
        payee,
        changed: (prev?.changed ?? false) || isChange,
        changedAt: isChange ? nowSeconds() : (prev?.changedAt ?? 0n),
      });
      return tx();
    },
    async claim(key) {
      const c = claims.get(key);
      if (!c) throw new TxRevertedError("claim", "NoClaim");
      if (c.changed && nowSeconds() < c.changedAt + CHANGE_DELAY) {
        throw new TxRevertedError("claim", "ClaimCoolingDown");
      }
      if (!reserved.get(key)) throw new TxRevertedError("claim", "NothingReserved");
      reserved.set(key, 0n);
      calls.push({ fn: "claim", key });
      return tx();
    },
  };
  return { chain, reserved, claims, calls };
}

export function scriptedScreen(result: WalletScreen = { ok: true, toxicScore: 0, traits: [], screenId: "" }) {
  const s = {
    screened: [] as Address[],
    result,
    screen: async (address: Address): Promise<WalletScreen> => {
      s.screened.push(address);
      return s.result;
    },
  };
  return s;
}
