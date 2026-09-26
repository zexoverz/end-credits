import { rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { split } from "../../lib/allocation/split";
import { MCP_COPY } from "../../lib/copy/mcp";
import { formatUsdc } from "../../lib/money";
import type { CreditView, SessionView } from "../../lib/sessions/view";
import { buildUpload } from "./attribute";
import { writeConfig } from "./config";
import { makeFixture } from "./fixture";
import { explainTool, rollTool, statusTool, type ToolDeps } from "./mcp-tools";
import { donePath, ledgerPath } from "./paths";

const API = "http://localhost:3999";
const KEY = "ec_secret_token";
const SERVER_ID = "0b9a6c52-1111-4222-8333-444455556666";
const NOW = new Date("2026-09-26T02:00:00Z");

type Call = { url: string; method: string; auth: string | null };

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetch: ToolDeps["fetch"] = async (url, init) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, auth: new Headers(init?.headers).get("authorization") });
    const route = routes[`${method} ${url.replace(API, "")}`];
    if (!route) throw new Error(`connect ECONNREFUSED ${url}`);
    return route();
  };
  return { fetch, calls };
}

function setup(withKey = true) {
  const fx = makeFixture([
    { t: "code", f: "h1", specs: ["zod"] },
    { t: "code", f: "h2", specs: ["zod", "viem"] },
    { t: "docs", u: "https://zod.dev/api" },
    { t: "read", p: "node_modules/viem/_types/index.d.ts" },
  ]);
  if (withKey) writeConfig(fx.home, KEY, API);
  return fx;
}

const deps = (home: string, fetch: ToolDeps["fetch"]): ToolDeps => ({ home, fetch, now: () => NOW, log: () => {} });
const json = (body: unknown, status = 200) => () => Response.json(body, { status });

describe("end_credits_status", () => {
  it("estimates with the owner's settings, matching lib/allocation/split", async () => {
    const fx = setup();
    const { fetch, calls } = fakeFetch({
      "GET /api/agent/settings": json({ sessionBudget: "1", packageCap: "0.3", dailyLimit: "20", settleMode: "auto" }),
    });
    const res = await statusTool({ sessionId: fx.sid }, deps(fx.home, fetch));
    expect(res.isError).toBeUndefined();
    expect(res.text).toContain(MCP_COPY.STATUS_SOURCE_OWNER);

    const { packages } = buildUpload(fx.home, fx.sid, NOW);
    const expected = split(new Map(packages.map((p) => [p.name, p.score])), 1_000_000n, 300_000n);
    const rows = JSON.parse(res.text.slice(res.text.indexOf("\n[") + 1)) as { package: string; estimate: string; score: number }[];
    expect(rows.map((r) => r.package)).toEqual(packages.map((p) => p.name));
    for (const r of rows) expect(r.estimate).toBe(formatUsdc(expected.get(r.package)!.amount));
    expect(rows.some((r) => r.estimate === "0.3")).toBe(true); // the cap bites

    // Only the settings read leaves the machine; no upload.
    expect(calls).toEqual([{ url: `${API}/api/agent/settings`, method: "GET", auth: `Bearer ${KEY}` }]);
    expect(res.text).not.toContain(KEY);
  });

  it("falls back to 2.00 / 0.25 and says estimate when the server is unreachable", async () => {
    const fx = setup();
    const res = await statusTool({}, deps(fx.home, fakeFetch({}).fetch));
    expect(res.text).toContain("budget 2 USDC, per-package cap 0.25 USDC");
    expect(res.text).toContain(MCP_COPY.STATUS_SOURCE_DEFAULT);
    const { packages } = buildUpload(fx.home, fx.sid, NOW);
    const expected = split(new Map(packages.map((p) => [p.name, p.score])), 2_000_000n, 250_000n);
    const rows = JSON.parse(res.text.slice(res.text.indexOf("\n[") + 1)) as { package: string; estimate: string }[];
    for (const r of rows) expect(r.estimate).toBe(formatUsdc(expected.get(r.package)!.amount));
  });
});

describe("end_credits_roll", () => {
  it("reuses an already-uploaded id instead of uploading again", async () => {
    const fx = setup();
    writeFileSync(donePath(fx.home, fx.sid), JSON.stringify({ id: SERVER_ID, url: `${API}/credits/${SERVER_ID}` }));
    rmSync(ledgerPath(fx.home, fx.sid));
    const { fetch, calls } = fakeFetch({
      [`POST /api/agent/sessions/${SERVER_ID}/settle`]: json({ id: SERVER_ID }, 202),
    });
    const res = await rollTool({ sessionId: fx.sid }, deps(fx.home, fetch));
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${API}/api/agent/sessions/${SERVER_ID}/settle`]);
    expect(res.isError).toBeUndefined();
    expect(res.text).toContain(`sessionId ${SERVER_ID}`);
  });

  it("uploads first when the ledger is still here, then requests settlement", async () => {
    const fx = setup();
    const { fetch, calls } = fakeFetch({
      "POST /api/sessions": json({ id: SERVER_ID, url: `${API}/credits/${SERVER_ID}` }, 201),
      [`POST /api/agent/sessions/${SERVER_ID}/settle`]: json({ error: "not_settleable" }, 409),
    });
    const res = await rollTool({}, deps(fx.home, fetch));
    expect(calls.map((c) => c.method + " " + c.url.replace(API, ""))).toEqual([
      "POST /api/sessions",
      `POST /api/agent/sessions/${SERVER_ID}/settle`,
    ]);
    expect(calls.every((c) => c.auth === `Bearer ${KEY}`)).toBe(true);
    expect(res.text).toContain("already rolling");
    expect(res.text).not.toContain(KEY);
  });

  it("refuses without an agent key", async () => {
    const fx = setup(false);
    const res = await rollTool({ sessionId: fx.sid }, deps(fx.home, fakeFetch({}).fetch));
    expect(res).toEqual({ text: MCP_COPY.KEY_MISSING, isError: true });
  });
});

describe("end_credits_explain", () => {
  const credit = (over: Partial<CreditView>): CreditView => ({
    package: "pkg",
    role: "featuring",
    outcome: null,
    amount: null,
    capped: false,
    reasons: [],
    signal: null,
    txHash: null,
    paidVia: null,
    payee: null,
    tipId: null,
    ...over,
  });
  const reason = (text: string) => [{ source: "decision", code: "X", text }];
  const TX = `0x${"ab".repeat(32)}`;

  async function explain(view: SessionView) {
    const fx = setup();
    const { fetch } = fakeFetch({ [`GET /api/sessions/${SERVER_ID}`]: json(view) });
    const res = await explainTool({ sessionId: SERVER_ID }, deps(fx.home, fetch));
    const data = JSON.parse(res.text.slice(res.text.indexOf("\n{") + 1));
    return { res, data };
  }

  const base = { id: SERVER_ID, settleRequested: true, repoLabel: null, startedAt: null, endedAt: null, recordTx: null };

  it("maps each outcome to its text, with reasons, tx and approve links", async () => {
    const { res, data } = await explain({
      ...base,
      status: "settled",
      credits: [
        credit({ package: "a", outcome: "paid", amount: "0.5", txHash: TX, reasons: reason("Paid 0.5 USDC.") }),
        credit({ package: "b", outcome: "capped", amount: "0.25", reasons: reason("Capped at 0.25 USDC.") }),
        credit({ package: "c", outcome: "held", amount: "0.1", tipId: "0xt1p", reasons: reason("Held: medium risk.") }),
        credit({ package: "d", outcome: "refused", amount: "0.1", reasons: reason("Refused. Intercepta: sanctioned") }),
        credit({ package: "e", outcome: "reserved", amount: "0.2" }),
        credit({ package: "f", outcome: "dust", amount: "0" }),
      ],
    });
    const byPkg = Object.fromEntries(data.credits.map((c: { package: string }) => [c.package, c]));
    expect(byPkg.a).toMatchObject({ outcome: MCP_COPY.OUTCOMES.paid, reasons: ["Paid 0.5 USDC."], tx: `https://sepolia.basescan.org/tx/${TX}` });
    expect(byPkg.b.outcome).toBe(MCP_COPY.OUTCOMES.capped);
    expect(byPkg.c).toMatchObject({ outcome: MCP_COPY.OUTCOMES.held, approve: `${API}/approve/0xt1p` });
    expect(byPkg.d).toMatchObject({ outcome: MCP_COPY.OUTCOMES.refused, reasons: ["Refused. Intercepta: sanctioned"] });
    expect(byPkg.e.outcome).toBe(MCP_COPY.OUTCOMES.reserved);
    expect(byPkg.f.outcome).toBe(MCP_COPY.OUTCOMES.dust);
    expect(byPkg.a.approve).toBeUndefined();
    expect(res.text.split("\n")[0]).toBe(
      `Settled. Paid 0.75 USDC to 2 projects. Held 0.1 USDC. Reserved 0.2 USDC for 1 project without a wallet. Refused 1. 1 held until the owner approves at ${API}/approve/0xt1p.`,
    );
  });

  it("names the rows still screening instead of inventing outcomes", async () => {
    const { res, data } = await explain({
      ...base,
      status: "settling",
      credits: [credit({ package: "a", outcome: "paid", amount: "0.5" }), credit({ package: "b" })],
    });
    expect(res.text.split("\n")[0]).toContain("Still screening: b.");
    expect(res.text).not.toContain("Paid 0.5 USDC to");
    expect(data.credits[1].outcome).toBe(MCP_COPY.OUTCOMES.screening);
  });

  it("reports a 404 as not found", async () => {
    const fx = setup();
    const { fetch } = fakeFetch({ [`GET /api/sessions/${SERVER_ID}`]: json({ error: "not_found" }, 404) });
    const res = await explainTool({ sessionId: SERVER_ID }, deps(fx.home, fetch));
    expect(res.isError).toBe(true);
    expect(res.text).toContain("No rolled session");
  });
});
