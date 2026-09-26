// Product wiring for the claim flow: the real escrow on Base Sepolia, the real Intercepta quick scan,
// the npm registry and payee resolution. Each dependency reads its env on first use, so a missing
// key fails the step that needs it (and a missing Intercepta key fails the screen closed).
import type { Address, Hex } from "viem";
import { escrowAbi } from "../chain/abi";
import * as escrow from "../chain/escrow";
import { chain as chainCtx, type ChainContext } from "../chain/keys";
import { db } from "../db/client";
import { readEnv } from "../env";
import { interceptaFromEnv } from "../intercepta/client";
import { drizzleScreenRepo } from "../intercepta/repo";
import { dbObservations } from "../payee/observe";
import { resolvePayee } from "../payee/resolve";
import { loadPackage } from "../registry/npm";
import type { ClaimChain, ClaimDeps, WalletScreen } from "./deps";
import { claimStore } from "./store";
import { quickScanWallet } from "./wallet-screen";

export function escrowClaimChain(ctx: () => ChainContext = chainCtx): ClaimChain {
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    ctx().publicClient.readContract({
      address: ctx().escrow,
      abi: escrowAbi,
      functionName,
      args,
    } as never) as Promise<T>;
  return {
    reserved: (key) => escrow.reserved(key, ctx()),
    async claimState(key) {
      const [payee, changedAt, changed] = await read<[Address, bigint | number, boolean]>("claims", [key]);
      return { payee, changedAt: BigInt(changedAt), changed };
    },
    changeDelay: async () => BigInt(await read<bigint | number>("changeDelay")),
    setClaim: (key: Hex, payee: Address, evidence: Hex) => escrow.setClaim(key, payee, evidence, ctx()),
    claim: (key: Hex) => escrow.claim(key, ctx()),
  };
}

export function claimDepsFromEnv(): ClaimDeps {
  const readToken = process.env.GITHUB_TOKEN_READ || undefined;
  const claimChain = escrowClaimChain();
  return {
    store: claimStore(db()),
    secret: readEnv("SESSION_SECRET"),
    appUrl: readEnv("APP_URL"),
    readToken,
    chain: claimChain,
    screen: (address: Address): Promise<WalletScreen> => quickScanWallet(interceptaFromEnv(drizzleScreenRepo()), address),
    loadPackage: (name) => loadPackage(name),
    payeeOf: async (pkg, opts) =>
      resolvePayee(
        {
          id: pkg.id,
          name: pkg.name,
          repoFullName: pkg.repoFullName,
          repoDirectory: pkg.repoDirectory,
          // npm `funding` is not stored; the registry read is cached for an hour.
          funding: (await loadPackage(pkg.name).catch(() => null))?.funding ?? null,
        },
        {
          store: opts?.observe === false ? { ...dbObservations(), record: async () => {} } : dbObservations(),
          githubToken: readToken,
          claimOf: async (key) => {
            const { payee } = await claimChain.claimState(key);
            return /^0x0{40}$/i.test(payee) ? null : payee;
          },
        },
      ),
  };
}
