import { describe, expect, it } from "vitest";
import { msg } from "../messages";
import { buildActions, buildTimeline, parseTriggeredAt, pendingHolds, TIMELINE_HOURS } from "./actions";
import { buildDashboard, invalidateDashboardCache } from "./dashboard";
import { ESCROW, fakeDashboardRepo, fakeMultiBaas, K3, K4, PAYER, tip } from "./__fixtures__/dashboard";

const HELD = "Held(bytes32,bytes32,address,address,uint256,uint8,uint64)";
const RELEASED = "Released(bytes32,address,uint256,bytes32)";
const REFUNDED = "Refunded(bytes32,address,uint256,bool)";
const NOW = Date.parse("2026-09-26T12:30:00Z");
const sec = (iso: string) => String(Date.parse(iso) / 1000);
// Saved-query results return bytes32 as a byte-array string; the first tip is given that way.
const asBytes = (hex: string) => `[${hex.slice(2).match(/../g)!.map((b) => parseInt(b, 16)).join(", ")}]`;

const held = (n: number, amount: string, expires: string) => ({ event: HELD, tip_id: tip(n), amount, detail: sec(expires), block: 1, tx: tip(99) });

describe("pendingHolds", () => {
  it("a released or refunded tip is not pending", () => {
    const rows = [
      { ...held(1, "100", "2026-09-27T00:00:00Z"), tip_id: asBytes(tip(1)) },
      held(2, "200", "2026-09-27T00:00:00Z"),
      held(3, "300", "2026-09-27T00:00:00Z"),
      { event: RELEASED, tip_id: asBytes(tip(1)), amount: "100", detail: tip(50), block: 2, tx: tip(98) },
      { event: REFUNDED, tip_id: tip(2), amount: "200", detail: "false", block: 3, tx: tip(97) },
    ];
    expect(pendingHolds(rows)).toEqual([{ tipId: tip(3), amount: 300n, expiresAt: Date.parse("2026-09-27T00:00:00Z") }]);
  });
});

describe("buildActions", () => {
  const pending = pendingHolds([
    held(1, "250000", "2026-09-27T09:00:00Z"), // later
    held(2, "100000", "2026-09-26T13:00:00Z"), // within 2 h
    held(3, "50000", "2026-09-26T20:00:00Z"), // sooner than 1, not within 2 h
    held(4, "70000", "2026-09-26T12:00:00Z"), // already expired: cannot be released
  ]);
  const holds = new Map([[tip(2), { tipId: tip(2), package: "@endcredits-demo/moved-payout", payee: "0xabc", reasons: [{ text: "Held: changed." }] }]]);
  const reserves = [
    { packageKey: K3, name: "@endcredits-demo/unclaimed-utils", amount: 400000n, sessions: 2 },
    { packageKey: K4, name: "@endcredits-demo/claimed-kit", amount: 0n, sessions: 1 },
    { packageKey: "0xbb", name: null, amount: 900000n, sessions: 1 },
  ];
  const actions = buildActions({ pending, holds, reserves, now: NOW });

  it("orders expiring warnings, then holds by soonest expiry, then reserves by amount", () => {
    expect(actions.map((a) => [a.kind, a.tipId ?? a.packageKey])).toEqual([
      ["hold_expiring", tip(2)],
      ["approve_hold", tip(2)],
      ["approve_hold", tip(3)],
      ["approve_hold", tip(1)],
      ["reserve_waiting", "0xbb"],
      ["reserve_waiting", K3],
    ]);
  });

  it("a hold carries the approve link, amount, DB package, payee and reason text", () => {
    expect(actions[1]).toEqual({
      kind: "approve_hold",
      title: msg("ACTION_APPROVE", { amount: "0.1", package: "@endcredits-demo/moved-payout" }),
      detail: "Held: changed.",
      href: `/app/approve/${tip(2)}`,
      amount: { micro: "100000", usdc: "0.1" },
      source: "multibaas",
      tipId: tip(2),
      package: "@endcredits-demo/moved-payout",
      payee: "0xabc",
      expiresAt: "2026-09-26T13:00:00.000Z",
    });
    expect(actions[0].title).toBe(
      msg("ACTION_EXPIRING", { amount: "0.1", package: "@endcredits-demo/moved-payout", time: "2026-09-26T13:00:00.000Z" }),
    );
  });

  it("a hold missing from our DB still shows, labelled by tip id", () => {
    expect(actions[2]).toMatchObject({ package: null, payee: null, detail: null });
    expect(actions[2].title).toContain(tip(3));
  });

  it("a reserve of 0 is not an action; a reserve links to the claim page", () => {
    expect(actions.find((a) => a.packageKey === K4)).toBeUndefined();
    expect(actions[5]).toMatchObject({
      href: "/app/npm/@endcredits-demo/unclaimed-utils",
      amount: { micro: "400000" },
      sessions: 2,
      title: msg("ACTION_RESERVE", { amount: "0.4", package: "@endcredits-demo/unclaimed-utils", sessions: "2 sessions" }),
    });
  });
});

describe("buildTimeline", () => {
  const recent = [
    { event: REFUNDED, amount: "250000", at: "2026-09-26 12:10:00+00" },
    { event: "SessionSettled(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256,bytes32)", amount: "999", at: "2026-09-26 12:09:00+00" },
    { event: HELD, amount: "250000", at: "2026-09-26 12:05:00+00" },
    { event: HELD, amount: "10000", at: "2026-09-26 11:59:59+00" },
    { event: "Reserved(bytes32,address,uint256,bytes32)", amount: "30000", at: "2026-09-26T11:00:00Z" },
    { event: "Claimed(bytes32,address,uint256)", amount: "30000", at: "2026-09-26 11:30:00+00" },
    { event: RELEASED, amount: "5", at: "2026-09-24 12:59:59+00" }, // before the window
  ];
  const paid = [
    { amount: 7n, at: "2026-09-26 12:00:00+00" },
    { amount: 3n, at: "2026-09-26 12:59:00+00" },
    { amount: 1n, at: "2026-09-24 13:00:00+00" }, // oldest hour in the window
  ];
  const t = buildTimeline(paid, recent, NOW);

  it("covers the last 48 UTC hours, oldest first", () => {
    expect(t).toHaveLength(TIMELINE_HOURS);
    expect(t[0].hour).toBe("2026-09-24T13:00:00.000Z");
    expect(t[47].hour).toBe("2026-09-26T12:00:00.000Z");
  });

  it("sums each series into its hour and ignores SessionSettled and older rows", () => {
    expect(t[47]).toMatchObject({
      paid: { micro: "10" },
      held: { micro: "250000" },
      refunded: { micro: "250000" },
      released: { micro: "0" },
    });
    expect(t[46]).toMatchObject({ held: { micro: "10000" }, reserved: { micro: "30000" }, claimed: { micro: "30000" } });
    expect(t[0]).toMatchObject({ paid: { micro: "1" }, released: { micro: "0" } });
    const total = (k: "paid" | "held" | "released") => t.reduce((s, b) => s + BigInt(b[k].micro), 0n);
    expect([total("paid"), total("held"), total("released")]).toEqual([11n, 260000n, 0n]);
  });

  it("reads Postgres text and ISO times", () => {
    expect(parseTriggeredAt("2026-09-26 10:38:38+00")).toBe(Date.parse("2026-09-26T10:38:38Z"));
    expect(parseTriggeredAt("2026-09-26T10:38:38Z")).toBe(Date.parse("2026-09-26T10:38:38Z"));
    expect(parseTriggeredAt("yesterday")).toBeNull();
  });
});

describe("dashboard actions and timeline", () => {
  const deps = (mb = fakeMultiBaas(), now = "2026-09-26T03:30:00Z") => ({
    mb,
    repo: fakeDashboardRepo(),
    payer: PAYER,
    escrow: ESCROW,
    now: () => Date.parse(now),
  });

  it("the pending tip comes back as an action with the DB package, released ones do not", async () => {
    invalidateDashboardCache();
    // The fixture's pending tip expires at 1790000000 (2026-09-21T13:33:20Z).
    const d = await buildDashboard(deps(fakeMultiBaas(), "2026-09-21T12:00:00Z"));
    const holds = d.actions.filter((a) => a.kind === "approve_hold");
    expect(holds.map((a) => a.tipId)).toEqual([tip(4)]);
    expect(holds[0]).toMatchObject({ package: "@endcredits-demo/moved-payout", amount: { micro: "70000" } });
    expect(d.actions.filter((a) => a.kind === "reserve_waiting").map((a) => a.packageKey)).toEqual([K3]);
  });

  it("paid in the timeline excludes the transfer to the escrow and the other token", async () => {
    const d = await buildDashboard(deps());
    const hour = d.timeline.find((b) => b.hour === "2026-09-26T01:00:00.000Z")!;
    expect(hour.paid).toEqual({ micro: "300000", usdc: "0.3" });
  });

  it("reads another recent page only while the last row is inside the window", async () => {
    const row = (at: string) => ({ event: HELD, subject: tip(1), amount: "1", block: 1, tx: tip(2), at });
    const inside = Array.from({ length: 50 }, () => row("2026-09-26 03:00:00+00"));
    const older = Array.from({ length: 50 }, () => row("2026-09-20 03:00:00+00"));
    const pages = [inside, older, inside];
    const mb = fakeMultiBaas();
    const base = mb.get.getMockImplementation() as (path: string) => Promise<unknown>;
    mb.get.mockImplementation(async (path: string) => {
      if (!path.startsWith("/queries/recent/")) return base(path);
      const offset = Number(/offset=(\d+)/.exec(path)![1]);
      return { rows: pages[offset / 50] };
    });
    const d = await buildDashboard(deps(mb));
    const recentCalls = mb.get.mock.calls.filter(([p]) => String(p).startsWith("/queries/recent/"));
    expect(recentCalls).toHaveLength(2);
    expect(d.recent).toHaveLength(50);
    expect(d.timeline.at(-1)!.held.micro).toBe("50");
  });
});
