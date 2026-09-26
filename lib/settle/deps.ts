// Production wiring for settlement: Postgres, the npm registry, GitHub, Intercepta (live, never
// faked here), the escrow through the tx queue, and the x402 client paying our own credit route.
import { zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { claimOf, hold, recordSession, reserve } from "../chain/escrow";
import { chain } from "../chain/keys";
import { db } from "../db/client";
import { noCodeOnBase } from "../decision/no-code";
import { readEnv } from "../env";
import { interceptaFromEnv } from "../intercepta/client";
import { drizzleScreenRepo } from "../intercepta/repo";
import { dbObservations } from "../payee/observe";
import { firstSeenPush } from "../payee/push";
import { resolvePayee } from "../payee/resolve";
import { loadPackage } from "../registry/npm";
import { payCredit } from "../x402/client";
import type { SettleDeps } from "./settle";
import { decisionAllowsPay } from "./store";

type Env = Record<string, string | undefined>;

export function settleDepsFromEnv(env: Env = process.env, log?: (line: string) => void): SettleDeps {
  const database = db();
  const ctx = chain();
  // chain() already checked the key's format; x402 needs a LocalAccount to sign typed data.
  const account = privateKeyToAccount(readEnv("PAYER_PRIVATE_KEY", env) as Hex);
  const usdc = readEnv("USDC_ADDRESS", env) as Address;
  const appUrl = readEnv("APP_URL", env).replace(/\/+$/, "");
  const githubToken = env.GITHUB_TOKEN_READ || undefined;
  const observations = dbObservations(database);
  const intercepta = interceptaFromEnv(drizzleScreenRepo(database));

  return {
    database,
    usdc,
    payer: account.address,
    observations,
    loadPackage: (name, version) => loadPackage(name, { version }),
    resolvePayee: (pkg) =>
      resolvePayee(pkg, {
        store: observations,
        githubToken,
        claimOf: async (key) => {
          const payee = await claimOf(key, ctx);
          return payee === zeroAddress ? null : payee;
        },
      }),
    pushedAt: (repo, file, since) => firstSeenPush(repo, file, { since, githubToken }),
    screenPayee: (payee, opts) => intercepta.screenPayee(payee, opts),
    simulatePayment: (payee, amount) => intercepta.simulatePayment({ payer: account.address, payee, amount }),
    // P1: only for a mainnet round (DESIGN §8 rule 7).
    ...(env.CHECK_NO_CODE === "true" ? { noCodeOnBase: (payee: Address) => noCodeOnBase(payee) } : {}),
    escrow: {
      reserve: (key, amount, sessionKey) => reserve(key, amount, sessionKey, ctx),
      hold: (a) => hold(a, ctx),
      recordSession: (s) => recordSession(s, ctx),
    },
    payCredit: (credit) =>
      payCredit(credit, {
        account,
        usdc,
        url: `${appUrl}/api/x402/credit/${credit.id}`,
        decisionAllowsPay: (id) => decisionAllowsPay(database, id),
      }),
    log,
  };
}
