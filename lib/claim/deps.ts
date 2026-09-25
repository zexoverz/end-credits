// What the claim flow needs from the outside world. Product wiring is in ./env.ts; tests pass a
// fake GitHub fetch, a fake chain and a fake screen.
import type { Address, Hash, Hex } from "viem";
import type { Resolution } from "../payee/resolve";
import type { NpmPackageWithDownloads } from "../registry/npm";
import type { ClaimStore, PackageRow } from "./store";

export type ClaimOnChain = { payee: Address; changedAt: bigint; changed: boolean };

export interface ClaimChain {
  reserved(key: Hex): Promise<bigint>;
  claimState(key: Hex): Promise<ClaimOnChain>;
  changeDelay(): Promise<bigint>;
  setClaim(key: Hex, payee: Address, evidence: Hex): Promise<Hash>;
  claim(key: Hex): Promise<Hash>;
}

// Intercepta quick scan of the claimed wallet. `ok: false` covers timeouts, HTTP and parse errors
// and a missing API key; the claim then stops before setClaim.
export type WalletScreen =
  | { ok: true; toxicScore: number; traits: { name: string; description: string }[]; screenId: string }
  | { ok: false; error: string; screenId?: string };

export type ClaimDeps = {
  store: ClaimStore;
  secret: string; // SESSION_SECRET: cookie and token seal
  appUrl: string;
  githubFetch?: typeof fetch;
  readToken?: string; // GITHUB_TOKEN_READ, for reads after the user token is gone
  chain: ClaimChain;
  screen(address: Address): Promise<WalletScreen>;
  loadPackage(name: string): Promise<NpmPackageWithDownloads>;
  // `observe: false` for page reads, so a page view writes no payee_observations row.
  payeeOf(pkg: PackageRow, opts?: { observe?: boolean }): Promise<Resolution>;
  now?: () => Date;
};
