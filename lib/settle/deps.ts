// Production wiring for settlement: Postgres, the npm registry, GitHub, Intercepta (live, never
// faked here), the escrow through the tx queue, and the x402 client paying the maintainer's own
// endpoint or, without one, our own credit route.
import { zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { budgetAddress, pull, remaining, returnToOwner } from "../chain/budget";
import { claimOf, hold, recordSession, reserve } from "../chain/escrow";
import { chain } from "../chain/keys";
import { db } from "../db/client";
import { noCodeOnBase } from "../decision/no-code";
import { readEnv } from "../env";
import { interceptaFromEnv } from "../intercepta/client";
import { drizzleScreenRepo } from "../intercepta/repo";
import { dbObservations } from "../payee/observe";
import { firstSeenPush, repoCreatedAt } from "../payee/push";
import { resolvePayee } from "../payee/resolve";
import { loadPackage } from "../registry/npm";
import { payCredit, payMaintainer } from "../x402/client";
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
  const budget = budgetAddress(env);

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
    repoCreatedAt: (repo) => repoCreatedAt(repo, { githubToken }),
    screenPayee: (payee, opts) => intercepta.screenPayee(payee, opts),
    // Off by default: Intercepta simulates only with the payer's mainnet balance (decisions.md).
    ...(env.SIMULATE_PAYMENTS === "true"
      ? { simulatePayment: (payee: Address, amount: bigint) => intercepta.simulatePayment({ payer: account.address, payee, amount }) }
      : {}),
    // P1: only for a mainnet round (DESIGN §8 rule 7).
    ...(env.CHECK_NO_CODE === "true" ? { noCodeOnBase: (payee: Address) => noCodeOnBase(payee) } : {}),
    escrow: {
      reserve: (key, amount, sessionKey) => reserve(key, amount, sessionKey, ctx),
      hold: (a) => hold(a, ctx),
      recordSession: (s) => recordSession(s, ctx),
    },
    // Spend limits: pull from the owner's own wallet when BUDGET_ADDRESS is set (decisions.md).
    ...(budget
      ? {
          budget: {
            remaining: (owner: Address) => remaining(owner, undefined, ctx, budget),
            pull: (owner: Address, amount: bigint) => pull(owner, amount, ctx, budget),
            returnToOwner: (owner: Address, amount: bigint) => returnToOwner(owner, amount, ctx),
          },
        }
      : {}),
    // Agent to agent: the maintainer's own x402 endpoint when FUNDING.json lists one, else ours.
    payCredit: ({ endpoint, ...credit }) => {
      const gate = { account, usdc, decisionAllowsPay: (id: string) => decisionAllowsPay(database, id) };
      return endpoint
        ? payMaintainer(credit, { ...gate, endpoint })
        : payCredit(credit, { ...gate, url: `${appUrl}/api/x402/credit/${credit.id}` });
    },
    log,
  };
}
