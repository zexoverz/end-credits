// Handlers behind `endcredits mcp` (decisions.md "MCP server"). Pure over `deps`, so tests pass a
// fake fetch. The agent reads and requests; the screened settler decides who is paid.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { split } from "../../lib/allocation/split";
import { reasonList } from "../../lib/approve/reasons";
import { fill, statusLine, totals, totalsLine } from "../../lib/client/roll";
import { MCP_COPY, type McpOutcome } from "../../lib/copy/mcp";
import { basescanTx, formatUsdc, parseUsdc } from "../../lib/money";
import type { CreditView, SessionView } from "../../lib/sessions/view";
import { buildUpload } from "./attribute";
import { readConfig, type Config } from "./config";
import { donePath, isSessionId, ledgerPath, sessionsDir } from "./paths";
import { settleSession } from "./settle";

export const DEFAULT_BUDGET = "2";
export const DEFAULT_CAP = "0.25";
export const MCP_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ToolDeps {
  home: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => Date;
  log: (line: string) => void;
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

const fail = (text: string): ToolResult => ({ text, isError: true });
const withJson = (lead: string, data: unknown) => `${lead}\n${JSON.stringify(data, null, 2)}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The most recently touched session with one of the given file suffixes. */
export function latestSession(home: string, suffixes: string[]): string | null {
  let best: { id: string; at: number } | null = null;
  let names: string[];
  try {
    names = readdirSync(sessionsDir(home));
  } catch {
    return null;
  }
  for (const name of names) {
    const suffix = suffixes.find((s) => name.endsWith(s));
    if (!suffix) continue;
    const id = name.slice(0, -suffix.length);
    if (!isSessionId(id)) continue;
    const at = statSync(path.join(sessionsDir(home), name)).mtimeMs;
    if (!best || at > best.at) best = { id, at };
  }
  return best?.id ?? null;
}

function pickSession(home: string, input: string | undefined, suffixes: string[]): string | ToolResult {
  if (input !== undefined) return isSessionId(input) ? input : fail(fill(MCP_COPY.BAD_SESSION, { id: input }));
  return latestSession(home, suffixes) ?? fail(MCP_COPY.NO_SESSION);
}

async function ownerLimits(config: Config | null, deps: ToolDeps) {
  const fallback = { budget: DEFAULT_BUDGET, cap: DEFAULT_CAP, source: MCP_COPY.STATUS_SOURCE_DEFAULT };
  if (!config) return fallback;
  try {
    const res = await deps.fetch(`${config.apiUrl}/api/agent/settings`, {
      headers: { authorization: `Bearer ${config.agentKey}` },
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { sessionBudget?: unknown; packageCap?: unknown };
    const budget = String(body.sessionBudget);
    const cap = String(body.packageCap);
    parseUsdc(budget);
    parseUsdc(cap);
    return { budget, cap, source: MCP_COPY.STATUS_SOURCE_OWNER };
  } catch (e) {
    deps.log(`end-credits mcp: settings unavailable (${errText(e)}), using defaults`);
    return fallback;
  }
}

export async function statusTool(input: { sessionId?: string }, deps: ToolDeps): Promise<ToolResult> {
  const id = pickSession(deps.home, input.sessionId, [".jsonl"]);
  if (typeof id !== "string") return id;
  if (!existsSync(ledgerPath(deps.home, id))) return fail(fill(MCP_COPY.NO_LEDGER, { id }));
  const { packages } = buildUpload(deps.home, id, deps.now());
  if (packages.length === 0) return { text: fill(MCP_COPY.NOTHING_USED, { id }) };

  const limits = await ownerLimits(readConfig(deps.home), deps);
  const shares = split(
    new Map(packages.map((p) => [p.name, p.score])),
    parseUsdc(limits.budget),
    parseUsdc(limits.cap),
  );
  const rows = packages.map((p) => {
    const share = shares.get(p.name);
    return {
      package: p.name,
      ...(p.version ? { version: p.version } : {}),
      role: p.role,
      score: p.score,
      signals: Object.fromEntries(Object.entries(p.signals).map(([s, u]) => [s, u?.count ?? 0])),
      estimate: share ? formatUsdc(share.amount) : "0",
      ...(share?.capped ? { capped: true } : {}),
      ...(share?.dust ? { dust: true } : {}),
    };
  });
  const header = fill(MCP_COPY.STATUS_HEADER, { id, budget: limits.budget, cap: limits.cap, source: limits.source });
  return { text: withJson(`${header}\n${MCP_COPY.STATUS_NOTE}`, rows) };
}

function readDone(home: string, id: string): { id: string; url: string } | null {
  try {
    const done = JSON.parse(readFileSync(donePath(home, id), "utf8")) as { id?: unknown; url?: unknown };
    return typeof done.id === "string" && typeof done.url === "string" ? { id: done.id, url: done.url } : null;
  } catch {
    return null;
  }
}

async function requestSettle(config: Config, serverId: string, deps: ToolDeps): Promise<number> {
  const res = await deps.fetch(`${config.apiUrl}/api/agent/sessions/${serverId}/settle`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.agentKey}` },
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });
  return res.status;
}

export async function rollTool(input: { sessionId?: string }, deps: ToolDeps): Promise<ToolResult> {
  const id = pickSession(deps.home, input.sessionId, [".jsonl", ".done.json"]);
  if (typeof id !== "string") return id;
  const config = readConfig(deps.home);
  if (!config) return fail(MCP_COPY.KEY_MISSING);

  let roll = existsSync(ledgerPath(deps.home, id)) ? null : readDone(deps.home, id);
  if (!roll) {
    if (!existsSync(ledgerPath(deps.home, id))) return fail(fill(MCP_COPY.NO_LEDGER, { id }));
    const res = await settleSession(deps.home, id, {
      fetch: deps.fetch,
      open: () => {},
      say: deps.log,
      now: deps.now,
      timeoutMs: MCP_TIMEOUT_MS,
    });
    if (!res.ok) {
      return res.error === "nothing used"
        ? { text: fill(MCP_COPY.NOTHING_USED, { id }) }
        : fail(fill(MCP_COPY.UPLOAD_FAILED, { error: res.error }));
    }
    roll = { id: res.id, url: res.url };
  }

  const vars = { id: roll.id, url: roll.url };
  try {
    const status = await requestSettle(config, roll.id, deps);
    if (status === 202) return { text: fill(MCP_COPY.ROLL_REQUESTED, vars) };
    if (status === 409) return { text: fill(MCP_COPY.ROLL_ALREADY, vars) };
    return fail(fill(MCP_COPY.ROLL_FAILED, { ...vars, error: `HTTP ${status}` }));
  } catch (e) {
    return fail(fill(MCP_COPY.ROLL_FAILED, { ...vars, error: errText(e) }));
  }
}

export function explainCredit(c: CreditView, apiUrl: string) {
  const outcome = (c.outcome ?? "screening") as McpOutcome;
  const tx = basescanTx(c.txHash);
  return {
    package: c.package,
    role: c.role,
    outcome: MCP_COPY.OUTCOMES[outcome] ?? c.outcome,
    ...(c.amount !== null ? { amount: c.amount } : {}),
    reasons: reasonList(c.reasons).map((r) => r.text),
    ...(tx ? { tx } : {}),
    ...(c.outcome === "held" && c.tipId ? { approve: `${apiUrl}/approve/${c.tipId}` } : {}),
  };
}

/** One plain paragraph from the roll's own texts; never an outcome the server did not record. */
export function explainSummary(view: SessionView, rows: ReturnType<typeof explainCredit>[]): string {
  if (view.credits.length === 0) return MCP_COPY.EXPLAIN_NONE;
  const status = statusLine(view) ?? view.status;
  if (view.status !== "settled") {
    const pending = view.credits.filter((c) => c.outcome === null).map((c) => c.package);
    return fill(MCP_COPY.EXPLAIN_STILL, { status, packages: pending.join(", ") || "none" });
  }
  const approve = rows.flatMap((r) => ("approve" in r && r.approve ? [r.approve] : []));
  const held = approve.length > 0 ? ` ${fill(MCP_COPY.SUMMARY_HELD, { count: approve.length, links: approve.join(", ") })}` : "";
  return `${status} ${totalsLine(totals(view.credits))}${held}`;
}

export async function explainTool(input: { sessionId: string }, deps: ToolDeps): Promise<ToolResult> {
  const config = readConfig(deps.home);
  if (!config) return fail(MCP_COPY.KEY_MISSING);
  let id = input.sessionId;
  if (!UUID.test(id) && isSessionId(id)) id = readDone(deps.home, id)?.id ?? id;
  if (!UUID.test(id)) return fail(fill(MCP_COPY.BAD_SESSION, { id: input.sessionId }));
  let view: SessionView;
  try {
    const res = await deps.fetch(`${config.apiUrl}/api/sessions/${id}`, { signal: AbortSignal.timeout(MCP_TIMEOUT_MS) });
    if (res.status === 404) return fail(fill(MCP_COPY.EXPLAIN_NOT_FOUND, { id }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    view = (await res.json()) as SessionView;
  } catch (e) {
    return fail(fill(MCP_COPY.EXPLAIN_FAILED, { id, error: errText(e) }));
  }
  const rows = view.credits.map((c) => explainCredit(c, config.apiUrl));
  const record = basescanTx(view.recordTx);
  return {
    text: withJson(explainSummary(view, rows), {
      id: view.id,
      status: view.status,
      url: `${config.apiUrl}/credits/${view.id}`,
      ...(record ? { recordTx: record } : {}),
      credits: rows,
    }),
  };
}
