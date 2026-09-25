// Intercepta (Web3 Antivirus) client (DESIGN §9). Every call goes to the real API and is stored in
// `screens` with its latency; a fresh successful row is reused for 1 h. Any timeout, HTTP error or
// unexpected body comes back as an error, and screenPayee turns that into Screen.error, which the
// matrix holds on.
import { encodeFunctionData, erc20Abi, getAddress } from "viem";
import type { z } from "zod";
import type { Address, Screen, ScreenError } from "../decision/types";
import { readEnv } from "../env";
import { freshScreen, type ScreenKey, type ScreenRepo } from "./cache";
import { timedJson } from "./http";
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

export type CallResult<T> =
  | { ok: true; data: T; screenId: string }
  | { ok: false; error: ScreenError; screenId: string };

export type InterceptaConfig = {
  base: string;
  apiKey: string;
  repo: ScreenRepo;
  fetch?: typeof fetch;
  timeoutMs?: number;
  clock?: () => number; // ms, for latency
  now?: () => Date; // for cache freshness
};

type Request = { path: string; method: "GET" | "POST"; body?: unknown };

export function createIntercepta(cfg: InterceptaConfig) {
  const fetchFn = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS;
  const clock = cfg.clock ?? (() => performance.now());
  const now = cfg.now ?? (() => new Date());
  const base = cfg.base.replace(/\/+$/, "");

  async function call<S extends z.ZodType>(
    key: ScreenKey,
    mappedFrom: string | null,
    schema: S,
    req: Request,
  ): Promise<CallResult<z.infer<S>>> {
    const cached = await freshScreen(cfg.repo, key, now());
    if (cached) {
      const parsed = schema.safeParse(cached.response);
      if (parsed.success) return { ok: true, data: parsed.data, screenId: cached.id };
    }
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
    const row = { ...key, mappedFrom, response: res.body, status: res.status, latencyMs };
    const screenId = await cfg.repo.insert(row);
    if (!res.ok) return { ok: false, error: res.error, screenId };
    const parsed = schema.safeParse(res.body);
    if (!parsed.success) return { ok: false, error: "PARSE", screenId };
    return { ok: true, data: parsed.data, screenId };
  }

  const payeeFrom = mapChain(BASE_SEPOLIA).mappedFrom;

  function quickScan(address: Address): Promise<CallResult<QuickScanResult>> {
    const a = address.toLowerCase();
    return call({ kind: "address", subject: a, chainId: null }, payeeFrom, QuickScan, {
      method: "GET",
      path: `/api/public/v2/extension/account/${a}/quick-scan`,
    });
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
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(tx.to.toLowerCase()), tx.amount] });
    return call(
      { kind: "simulation", subject: tx.to.toLowerCase(), chainId: chain.chainId },
      chain.mappedFrom,
      Simulation,
      {
        method: "POST",
        path: `/api/public/v1/extension/simulation/transaction?chainId=${chain.chainId}`,
        body: { transaction: { from: tx.from, to: BASE_USDC, value: "0x0", data }, mode: "short" },
      },
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

    let address: { toxicScore: number; traits: Screen["traits"] } | undefined;
    let error: ScreenError | undefined;
    if (scan.ok) {
      address = { toxicScore: scan.data.toxicScore, traits: scan.data.traits.map(nameAndDescription) };
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
      screenIds,
    };
  }

  return { quickScan, checkImpersonation, tokenRisks, simulateTransfer, screenPayee };
}

export type Intercepta = ReturnType<typeof createIntercepta>;

export function interceptaFromEnv(repo: ScreenRepo): Intercepta {
  return createIntercepta({
    base: readEnv("INTERCEPTA_BASE"),
    apiKey: readEnv("INTERCEPTA_API_KEY"),
    repo,
  });
}

function nameAndDescription(t: { name: string; description: string }) {
  return { name: t.name, description: t.description };
}
