import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDashboard,
  dashboardResponse,
  getDashboard,
  invalidateDashboardCache,
  type DashboardDeps,
} from "./dashboard";
import {
  ESCROW,
  fakeDashboardRepo,
  fakeMultiBaas,
  K1,
  K2,
  K3,
  K4,
  PAYER,
  unreachable,
} from "./__fixtures__/dashboard";

function deps(overrides: Record<string, unknown> = {}, now = () => 1_000_000): DashboardDeps & { mb: ReturnType<typeof fakeMultiBaas> } {
  return { mb: fakeMultiBaas(overrides), repo: fakeDashboardRepo(), payer: PAYER, escrow: ESCROW, now };
}

beforeEach(() => invalidateDashboardCache());

describe("dashboard cards", () => {
  it("paid counts payer transfers that belong to a credit, to anyone but the escrow, on the usdc contract only", async () => {
    const d = await buildDashboard(deps());
    expect(d.cards.paid).toEqual({ amount: { micro: "300000", usdc: "0.3" }, count: 2 });
  });

  it("held splits approved, denied, expired and pending by tip", async () => {
    const d = await buildDashboard(deps());
    expect(d.cards.held).toEqual({
      approved: { count: 1, amount: { micro: "300000", usdc: "0.3" } },
      denied: { count: 1, amount: { micro: "200000", usdc: "0.2" } },
      expired: { count: 1, amount: { micro: "100000", usdc: "0.1" } },
      pending: { count: 1, amount: { micro: "70000", usdc: "0.07" } },
    });
  });

  it("refused comes from the decision log and says so", async () => {
    const d = await buildDashboard(deps());
    expect(d.cards.refused).toEqual({ count: 3, source: "decision_log" });
  });

  it("reserved waiting lists packages with a positive balance", async () => {
    const d = await buildDashboard(deps());
    expect(d.cards.reserved).toEqual({
      amount: { micro: "400000", usdc: "0.4" },
      packages: [{ packageKey: K3, name: "@endcredits-demo/unclaimed-utils", amount: { micro: "400000", usdc: "0.4" } }],
    });
  });

  it("projects credited is distinct packages paid or reserved", async () => {
    const d = await buildDashboard(deps());
    expect(d.cards.projects).toEqual({ count: 4 });
  });
});

describe("dashboard table and lists", () => {
  it("builds one row per package with names from our DB and amounts from MultiBaas", async () => {
    const d = await buildDashboard(deps());
    const byKey = Object.fromEntries(d.packages.map((p) => [p.packageKey, p]));
    expect(byKey[K1]).toMatchObject({ name: "zod", sessions: 1, paid: { micro: "250000" }, reserved: { micro: "0" }, lastDecision: { outcome: "paid" } });
    expect(byKey[K2]).toMatchObject({ name: "viem", sessions: 1, paid: { micro: "50000" }, lastDecision: null });
    expect(byKey[K3]).toMatchObject({ sessions: 2, paid: { micro: "0" }, reserved: { micro: "400000" } });
    expect(byKey[K4]).toMatchObject({ sessions: 1, reserved: { micro: "0" } });
  });

  it("lists recent escrow events and settled sessions", async () => {
    const d = await buildDashboard(deps());
    expect(d.recent[0]).toMatchObject({ event: "SessionSettled", amount: { micro: "50000" }, block: 41 });
    expect(d.recent).toHaveLength(2);
    expect(d.sessions).toEqual({ count: 2 });
  });

  it("asks for every usdc payer transfer (not the escrow), to map them to packages", async () => {
    const x = deps();
    await buildDashboard(x);
    const txs = (x.repo.creditsByTx as unknown as { mock: { calls: string[][][] } }).mock.calls[0][0];
    expect(txs).toHaveLength(3);
  });
});

describe("dashboard failures never invent numbers", () => {
  it("MultiBaas unreachable → 503 with the error and no cards", async () => {
    const res = await dashboardResponse(deps({ paid_totals: unreachable() }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("multibaas_unavailable");
    expect(body.detail).toContain("fetch failed");
    expect(body.cards).toBeUndefined();
  });

  it("an amount MultiBaas renders as a decimal → 503, not a rounded number", async () => {
    const res = await dashboardResponse(
      deps({ reserved_by_package: { rows: [{ package_key: K3, amount: "0.4" }] } }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).detail).toMatch(/unexpected amount/);
  });

  it("returns 200 with the data when everything answers", async () => {
    const res = await dashboardResponse(deps());
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe("multibaas");
  });
});

describe("dashboard cache", () => {
  it("serves from cache for 60 s, then refetches", async () => {
    let t = 0;
    const x = deps({}, () => t);
    await getDashboard(x);
    const calls = x.mb.get.mock.calls.length;
    t = 59_000;
    await getDashboard(x);
    expect(x.mb.get.mock.calls.length).toBe(calls);
    t = 60_001;
    await getDashboard(x);
    expect(x.mb.get.mock.calls.length).toBe(calls * 2);
  });

  it("invalidation forces a refetch", async () => {
    const x = deps();
    await getDashboard(x);
    const calls = x.mb.get.mock.calls.length;
    invalidateDashboardCache();
    await getDashboard(x);
    expect(x.mb.get.mock.calls.length).toBe(calls * 2);
  });

  it("does not cache a failure", async () => {
    const bad = deps({ paid_totals: unreachable() });
    await expect(getDashboard(bad)).rejects.toThrow();
    const good = deps();
    await expect(getDashboard(good)).resolves.toMatchObject({ source: "multibaas" });
  });
});
