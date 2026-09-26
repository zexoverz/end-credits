import { describe, expect, it } from "vitest";
import { ROLL_COPY } from "../copy/roll";
import type { CreditView } from "../sessions/view";
import {
  canRoll,
  firstReason,
  fromMicro,
  groupByRole,
  isLive,
  settleResult,
  signalLine,
  statusLine,
  toMicro,
  totals,
  totalsLine,
} from "./roll";

const credit = (over: Partial<CreditView>): CreditView => ({
  package: "pkg",
  role: "featuring",
  outcome: null,
  amount: "0",
  capped: false,
  reasons: [],
  signal: null,
  txHash: null,
  payee: null,
  tipId: null,
  ...over,
});

describe("groupByRole", () => {
  it("orders Starring, Featuring, Research, Special thanks and drops empty roles", () => {
    const groups = groupByRole([
      credit({ package: "t", role: "thanks" }),
      credit({ package: "r", role: "research" }),
      credit({ package: "s1", role: "starring" }),
      credit({ package: "s2", role: "starring" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Starring", "Research", "Special thanks"]);
    expect(groups[0].credits.map((c) => c.package)).toEqual(["s1", "s2"]);
  });

  it("leaves out an unknown role instead of inventing a group", () => {
    expect(groupByRole([credit({ role: "cameo" })])).toEqual([]);
  });
});

describe("totals", () => {
  const credits = [
    credit({ outcome: "paid", amount: "0.25" }),
    credit({ outcome: "capped", amount: "0.25" }),
    credit({ outcome: "held", amount: "0.1" }),
    credit({ outcome: "reserved", amount: "0.05" }),
    credit({ outcome: "refused", amount: "0.3" }),
    credit({ outcome: "dust", amount: "0.004" }),
    credit({ outcome: null, amount: "1" }),
  ];

  it("counts paid and capped as paid, and leaves dust and undecided out", () => {
    expect(totals(credits)).toEqual({
      paidMicro: 500000n,
      paidCount: 2,
      heldMicro: 100000n,
      reservedMicro: 50000n,
      reservedCount: 1,
      refusedCount: 1,
    });
  });

  it("writes the SPEC §12.1 sentence", () => {
    expect(totalsLine(totals(credits))).toBe(
      "Paid 0.5 USDC to 2 projects. Held 0.1 USDC. Reserved 0.05 USDC for 1 project without a wallet. Refused 1.",
    );
  });
});

describe("amounts", () => {
  it("round-trips decimal USDC through micro", () => {
    expect(toMicro("0.25")).toBe(250000n);
    expect(toMicro("2")).toBe(2000000n);
    expect(toMicro("0.000001")).toBe(1n);
    expect(toMicro("junk")).toBe(0n);
    expect(fromMicro(250000n)).toBe("0.25");
    expect(fromMicro(2000000n)).toBe("2");
  });
});

describe("isLive", () => {
  it("polls while uploaded or settling and stops once settled or failed", () => {
    expect(isLive("uploaded")).toBe(true);
    expect(isLive("settling")).toBe(true);
    expect(isLive("settled")).toBe(false);
    expect(isLive("failed")).toBe(false);
  });
});

describe("canRoll", () => {
  it("shows the button only for an uploaded session nobody asked to settle", () => {
    expect(canRoll({ status: "uploaded", settleRequested: false })).toBe(true);
    expect(canRoll({ status: "uploaded", settleRequested: true })).toBe(false);
    expect(canRoll({ status: "settling", settleRequested: true })).toBe(false);
  });
});

describe("statusLine", () => {
  it("says the roll was requested between the press and the settler starting", () => {
    expect(statusLine({ status: "uploaded", settleRequested: true })).toBe(ROLL_COPY.ROLL_REQUESTED);
    expect(statusLine({ status: "uploaded", settleRequested: false })).toBe(ROLL_COPY.STATUS.uploaded);
    expect(statusLine({ status: "weird", settleRequested: false })).toBeNull();
  });
});

describe("settleResult", () => {
  it("maps each settle status to its kind", () => {
    expect(settleResult(202).kind).toBe("requested");
    expect(settleResult(401).kind).toBe("sign_in");
    expect(settleResult(403).kind).toBe("forbidden");
    expect(settleResult(409).kind).toBe("conflict");
    expect(settleResult(500, "boom").text).toContain("boom");
  });
});

describe("row text", () => {
  it("reads the first reason defensively", () => {
    expect(firstReason([{ source: "policy", code: "PAID", text: "Paid 0.25 USDC." }, { text: "b" }])).toBe(
      "Paid 0.25 USDC.",
    );
    expect(firstReason(null)).toBeNull();
    expect(firstReason([{ code: "X" }])).toBeNull();
  });

  it("labels the main signal with its count", () => {
    expect(signalLine({ signal: "import", count: 6 })).toBe("import · 6");
    expect(signalLine(null)).toBeNull();
  });
});
