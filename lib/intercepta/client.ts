// Intercepta (Web3 Antivirus) client (DESIGN §9). Every call goes to the real API and is stored in
// `screens` with its latency; a fresh successful row is reused for 1 h. Any timeout, HTTP error or
// unexpected body comes back as an error, and screenPayee turns that into Screen.error, which the
// matrix holds on.
import { encodeFunctionData, erc20Abi, getAddress } from "viem";
import type { z } from "zod";
import type { Address, Screen, ScreenError } from "../decision/types";
import { readEnv } from "../env";
import { freshScreen, type ScreenKey, type ScreenRepo } from "./cache";
import { timedJson, transient } from "./http";
import { isNoHistory } from "./no-history";
import { BASE_SEPOLIA, BASE_SEPOLIA_USDC, BASE_USDC, mapChain, mapToken } from "./mapping";
import {
  Impersonation,
  QuickScan,
  Simulation,
  TokenRisks,
  type ImpersonationResult,
  type QuickScanResult,
  type SimulationResult,
  type TokenRisksResult,
} from "./schemas";

export const TIMEOUT_MS = 8000;
export const RETRY_DELAY_MS = 500;
// A Base EOA holding USDC and ETH (79,178 USDC on 26 Sep), used as the sender of the payment
// simulation because the payer has no mainnet balance. Same recipient, same amount.
export const SIMULATION_FROM: Address = "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A quick scan of an address Intercepta has never seen on mainnet (decisions.md, 26 Sep).
const NO_HISTORY_SCAN: QuickScanResult = { toxicScore: 0, traits: [], noHistory: true };

export type CallResult<T> =
  | { ok: true; data: T; screenId: string }
  | { ok: false; error: ScreenError; screenId: string };

export type InterceptaConfig = {
  base: string;
  apiKey: string;
  repo: ScreenRepo;
  fetch?: typeof fetch;
  timeoutMs?: number; // per attempt
  retryDelayMs?: number; // pause before the one retry
  clock?: () => number; // ms, for latency
  now?: () => Date; // for cache freshness
};

type Request = { path: string; method: "GET" | "POST"; body?: unknown };

export function createIntercepta(cfg: InterceptaConfig) {
  const fetchFn = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS;
  const retryDelayMs = cfg.retryDelayMs ?? RETRY_DELAY_MS;
  const clock = cfg.clock ?? (() => performance.now());
  const now = cfg.now ?? (() => new Date());
  const base = cfg.base.replace(/\/+$/, "");

  // `noHistory`: what the no-history 404 means for this call (quick scan only); absent, it is an error.
  async function call<S extends z.ZodType>(
    key: ScreenKey,
    mappedFrom: string | null,
    schema: S,
    req: Request,
    noHistory?: z.infer<S>,
  ): Promise<CallResult<z.infer<S>>> {
    const cached = await freshScreen(cfg.repo, key, now());
    if (cached) {
      if (noHistory !== undefined && isNoHistory(cached.status, cached.response)) {
        return { ok: true, data: noHistory, screenId: cached.id };
      }
      const parsed = schema.safeParse(cached.response);
      if (parsed.success) return { ok: true, data: parsed.data, screenId: cached.id };
    }
    // One retry on a transient failure; both attempts are stored, only the last one decides.
    let last = await attempt(key, mappedFrom, req, noHistory !== undefined);
    if (transient(last.res)) {
      await sleep(retryDelayMs);
      last = await attempt(key, mappedFrom, req, noHistory !== undefined);
    }
    const { res, fresh, screenId } = last;
    if (fresh && noHistory !== undefined) return { ok: true, data: noHistory, screenId };
    if (!res.ok) return { ok: false, error: res.error, screenId };
    const parsed = schema.safeParse(res.body);
    if (!parsed.success) return { ok: false, error: "PARSE", screenId };
    return { ok: true, data: parsed.data, screenId };
  }

  // One HTTP attempt, stored in `screens` whatever the outcome. `fresh` is the no-history 404.
  async function attempt(key: ScreenKey, mappedFrom: string | null, req: Request, readsNoHistory: boolean) {
    const started = clock();
    const res = await timedJson(
      fetchFn,
      base + req.path,
      {
        method: req.method,
        headers: {
          "X-API-KEY": cfg.apiKey,
          accept: "application/json",
          ...(req.body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
      },
      timeoutMs,
    );
    const latencyMs = Math.max(0, Math.round(clock() - started));
    const fresh = readsNoHistory && !res.ok && isNoHistory(res.status, res.raw);
    const response = fresh && !res.ok ? res.raw : res.body;
    const screenId = await cfg.repo.insert({ ...key, mappedFrom, response, status: res.status, latencyMs });
    return { res, fresh, screenId };
  }

  const payeeFrom = mapChain(BASE_SEPOLIA).mappedFrom;

  // `note` replaces the mapped_from text (the x402 route marks its payer screen this way).
  function quickScan(address: Address, note?: string): Promise<CallResult<QuickScanResult>> {
    const a = address.toLowerCase();
    return call(
      { kind: "address", subject: a, chainId: null },
      note ?? payeeFrom,
      QuickScan,
      { method: "GET", path: `/api/public/v2/extension/account/${a}/quick-scan` },
      NO_HISTORY_SCAN,
    );
  }

  function checkImpersonation(address: Address): Promise<CallResult<ImpersonationResult>> {
    const a = address.toLowerCase();
    return call({ kind: "impersonation", subject: a, chainId: null }, payeeFrom, Impersonation, {
      method: "GET",
      path: `/api/public/v1/extension/poisoning-attack/check-address/${a}`,
    });
  }

  function tokenRisks(address: Address, chainId: number): Promise<CallResult<TokenRisksResult>> {
    const t = mapToken(address, chainId);
    const a = t.address.toLowerCase();
    return call({ kind: "token", subject: a, chainId: t.chainId }, t.mappedFrom, TokenRisks, {
      method: "GET",
      path: `/api/public/v2/extension/token-intelligence/token/${a}/risks?chainId=${t.chainId}`,
    });
  }

  function simulateTransfer(tx: { from: Address; to: Address; amount: bigint }): Promise<CallResult<SimulationResult>> {
    const chain = mapChain(BASE_SEPOLIA);
    return call(
      { kind: "simulation", subject: tx.to.toLowerCase(), chainId: chain.chainId },
      chain.mappedFrom,
      Simulation,
      transferRequest(tx.from, tx.to, tx.amount, chain.chainId),
    );
  }

  // The exact x402 payment as USDC.transfer(payee, amount) on Base. Sent from SIMULATION_FROM, not
  // the payer: the payer holds no mainnet USDC and Intercepta answers 400 "not enough funds"
  // (decisions.md, simulate the payment). Keyed by payee and amount, so only this payment reuses it.
  function simulatePayment(p: { payer: Address; payee: Address; amount: bigint }): Promise<CallResult<SimulationResult>> {
    const chain = mapChain(BASE_SEPOLIA);
    const token = mapToken(BASE_SEPOLIA_USDC, BASE_SEPOLIA);
    const note = `${token.mappedFrom}; payer ${p.payer.toLowerCase()} simulated as ${SIMULATION_FROM.toLowerCase()}`;
    return call(
      { kind: "simulation", subject: `${p.payee.toLowerCase()}/${p.amount}`, chainId: chain.chainId },
      note,
      Simulation,
      transferRequest(SIMULATION_FROM, p.payee, p.amount, chain.chainId),
    );
  }

  // Quick scan, impersonation and token risks in parallel; simulation only if quick scan fails
  // (DESIGN §9). Any remaining failure sets Screen.error.
  async function screenPayee(payee: Address, opts: { from: Address; amount: bigint }): Promise<Screen> {
    const [scan, imp, token] = await Promise.all([
      quickScan(payee),
      checkImpersonation(payee),
      tokenRisks(BASE_SEPOLIA_USDC, BASE_SEPOLIA),
    ]);
    const screenIds = [scan.screenId, imp.screenId, token.screenId];

    let address: { toxicScore: number; traits: Screen["traits"]; noHistory?: true } | undefined;
    let error: ScreenError | undefined;
    if (scan.ok) {
      address = {
        toxicScore: scan.data.toxicScore,
        traits: scan.data.traits.map(nameAndDescription),
        ...(scan.data.noHistory ? { noHistory: true as const } : {}),
      };
    } else {
      const sim = await simulateTransfer({ from: opts.from, to: payee, amount: opts.amount });
      screenIds.push(sim.screenId);
      if (sim.ok) {
        address = {
          toxicScore: 0,
          traits: sim.data.detectors.map((d) => ({ name: d.code, description: d.description })),
        };
      } else error = scan.error;
    }
    if (!imp.ok) error ??= imp.error;
    if (!token.ok) error ??= token.error;

    return {
      toxicScore: address?.toxicScore ?? 0,
      traits: address?.traits ?? [],
      tokenAction: token.ok ? token.data.action : "info",
      tokenDetectors: token.ok ? token.data.detectors : [],
      impersonation:
        imp.ok && imp.data.isAddressPoisoned ? { original: imp.data.originalAddress ?? "" } : null,
      ...(error ? { error } : {}),
      ...(address?.noHistory ? { noHistory: true } : {}),
      screenIds,
    };
  }

  return { quickScan, checkImpersonation, tokenRisks, simulateTransfer, simulatePayment, screenPayee };
}

export type Intercepta = ReturnType<typeof createIntercepta>;

export function interceptaFromEnv(repo: ScreenRepo): Intercepta {
  return createIntercepta({
    base: readEnv("INTERCEPTA_BASE"),
    apiKey: readEnv("INTERCEPTA_API_KEY"),
    repo,
  });
}

function transferRequest(from: Address, to: Address, amount: bigint, chainId: number): Request {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(to.toLowerCase()), amount] });
  return {
    method: "POST",
    path: `/api/public/v1/extension/simulation/transaction?chainId=${chainId}`,
    body: { transaction: { from, to: BASE_USDC, value: "0x0", data }, mode: "short" },
  };
}

function nameAndDescription(t: { name: string; description: string }) {
  return { name: t.name, description: t.description };
}
