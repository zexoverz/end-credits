import { describe, expect, it } from "vitest";
import {
  absoluteTime,
  cardsView,
  npmHref,
  parseTime,
  relativeTime,
  shortHex,
  sortPackages,
  sortRecent,
  subjectLabel,
  toDashboardError,
  type Dashboard,
  type PackageRow,
  type RecentEvent,
} from "./dashboard";

const m = (micro: string, usdc: string) => ({ micro, usdc });
const zero = m("0", "0");
const KEY_A = "0x" + "a".repeat(64);
const KEY_B = "0x" + "b".repeat(64);
const KEY_C = "0x" + "c".repeat(64);

function pkg(over: Partial<PackageRow>): PackageRow {
  return { packageKey: KEY_A, name: null, sessions: 0, paid: zero, reserved: zero, lastDecision: null, ...over };
}

function event(over: Partial<RecentEvent>): RecentEvent {
  return { event: "Held", subject: KEY_A, amount: m("10000", "0.01"), block: 1, tx: "0x" + "1".repeat(64), at: null, ...over };
}

// Shape taken from the live /api/dashboard on 26 Sep 2026, then filled in where it was empty.
const dash: Dashboard = {
  source: "multibaas",
  generatedAt: "2026-09-25T19:16:09.564Z",
  escrow: "0x63047583FbCe241D72d71137C940aa27BBdC60f1",
  payer: "0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6",
  cards: {
    paid: { count: 3, amount: m("150000", "0.15") },
    projects: { count: 4 },
    held: {
      approved: { count: 1, amount: m("10000", "0.01") },
      denied: { count: 2, amount: m("20000", "0.02") },
      expired: { count: 0, amount: zero },
      pending: { count: 1, amount: m("30000", "0.03") },
    },
    refused: { count: 5, source: "decision_log" },
    reserved: {
      amount: m("70000", "0.07"),
      packages: [
        { packageKey: KEY_A, name: "left-pad", amount: m("20000", "0.02") },
        { packageKey: KEY_B, name: null, amount: m("50000", "0.05") },
      ],
    },
  },
  packages: [],
  sessions: { count: 2 },
  recent: [],
};

describe("cardsView", () => {
  const v = cardsView(dash);

  it("shows the paid amount and payment count", () => {
    expect(v.paid).toEqual({ amount: "0.15 USDC", sub: "3 payments" });
  });

  it("lists held as pending, approved, denied, expired with amounts", () => {
    expect(v.held.map((h) => [h.label, h.count, h.amount])).toEqual([
      ["Pending", 1, "0.03 USDC"],
      ["Approved", 1, "0.01 USDC"],
      ["Denied", 2, "0.02 USDC"],
      ["Expired", 0, "0 USDC"],
    ]);
  });

  it("labels refused as coming from the decision log", () => {
    expect(v.refused.count).toBe(5);
    expect(v.refused.sub).toMatch(/decision log/);
  });

  it("orders reserved packages by amount and links only named ones", () => {
    expect(v.reserved.amount).toBe("0.07 USDC");
    expect(v.reserved.sub).toBe("for 2 packages without a wallet");
    expect(v.reserved.packages).toEqual([
      { key: KEY_B, name: null, href: null, amount: "0.05 USDC" },
      { key: KEY_A, name: "left-pad", href: "/npm/left-pad", amount: "0.02 USDC" },
    ]);
  });

  it("does not reorder the input", () => {
    expect(dash.cards.reserved.packages[0].packageKey).toBe(KEY_A);
  });
});

describe("npmHref", () => {
  it("keeps a scoped name as two segments", () => {
    expect(npmHref("@tanstack/react-query")).toBe("/npm/%40tanstack/react-query");
  });
  it("is null without a name", () => {
    expect(npmHref(null)).toBeNull();
  });
});

describe("sortPackages", () => {
  it("puts the most money first, then sessions, then named before unnamed", () => {
    const rows = [
      pkg({ packageKey: KEY_A, name: "zod", sessions: 1, paid: m("10", "0.00001") }),
      pkg({ packageKey: KEY_B, name: null, sessions: 3, reserved: m("10", "0.00001") }),
      pkg({ packageKey: KEY_C, name: "chalk", sessions: 1, paid: m("5", "0.000005"), reserved: m("100", "0.0001") }),
    ];
    expect(sortPackages(rows).map((r) => r.packageKey)).toEqual([KEY_C, KEY_B, KEY_A]);
  });

  it("compares micro amounts as integers, not strings", () => {
    const rows = [pkg({ packageKey: KEY_A, paid: m("9", "") }), pkg({ packageKey: KEY_B, paid: m("10", "") })];
    expect(sortPackages(rows)[0].packageKey).toBe(KEY_B);
  });
});

describe("sortRecent", () => {
  it("puts the newest block first and keeps API order within a block", () => {
    const rows = [event({ block: 5, event: "Held" }), event({ block: 9 }), event({ block: 5, event: "Refunded" })];
    expect(sortRecent(rows).map((r) => [r.block, r.event])).toEqual([
      [9, "Held"],
      [5, "Held"],
      [5, "Refunded"],
    ]);
  });
});

describe("time", () => {
  it("parses the Postgres text MultiBaas returns", () => {
    expect(parseTime("2026-09-25 18:46:24+00")?.toISOString()).toBe("2026-09-25T18:46:24.000Z");
    expect(parseTime("2026-09-25 18:46:24+0900")?.toISOString()).toBe("2026-09-25T09:46:24.000Z");
  });

  it("parses ISO and rejects garbage as null", () => {
    expect(parseTime("2026-09-25T19:16:09.564Z")?.getTime()).toBe(Date.UTC(2026, 8, 25, 19, 16, 9, 564));
    expect(parseTime("yesterday")).toBeNull();
    expect(parseTime(null)).toBeNull();
  });

  it("formats relative times and shows a dash when unknown", () => {
    const now = Date.parse("2026-09-25T18:46:24Z");
    expect(relativeTime("2026-09-25 18:46:22+00", now)).toBe("just now");
    expect(relativeTime("2026-09-25 18:46:00+00", now)).toBe("24 s ago");
    expect(relativeTime("2026-09-25 18:30:24+00", now)).toBe("16 min ago");
    expect(relativeTime("2026-09-25 13:46:24+00", now)).toBe("5 h ago");
    expect(relativeTime("2026-09-22 18:46:24+00", now)).toBe("3 d ago");
    expect(relativeTime(null, now)).toBe("—");
  });

  it("formats absolute times in UTC", () => {
    expect(absoluteTime("2026-09-25 18:46:24+00")).toBe("2026-09-25 18:46:24 UTC");
    expect(absoluteTime("nope")).toBe("—");
  });
});

describe("subjects", () => {
  it("shortens a bytes32", () => {
    expect(shortHex("0xc13c5db959d8fae6245e5108dbb170f2c7ed8f4a195af441057dced278bde488")).toBe("0xc13c5d…e488");
  });

  it("names a package key the table knows and shortens anything else", () => {
    const rows = [pkg({ packageKey: KEY_A, name: "zod" })];
    expect(subjectLabel(KEY_A.toUpperCase().replace("0X", "0x"), rows)).toEqual({ label: "zod", href: "/npm/zod" });
    expect(subjectLabel(KEY_B, rows)).toEqual({ label: shortHex(KEY_B), href: null });
  });
});

describe("toDashboardError", () => {
  it("keeps the 503 body's error, kind and detail", () => {
    const e = toDashboardError(503, { error: "multibaas_unavailable", kind: "network", detail: "fetch failed" }, "HTTP 503");
    expect(e).toEqual({ status: 503, error: "multibaas_unavailable", kind: "network", detail: "fetch failed" });
  });

  it("falls back to the HTTP message when the body is not JSON", () => {
    expect(toDashboardError(502, null, "HTTP 502")).toEqual({ status: 502, error: "HTTP 502", kind: null, detail: null });
  });
});
