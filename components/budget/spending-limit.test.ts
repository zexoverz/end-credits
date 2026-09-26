import { describe, expect, it } from "vitest";
import {
  spendingAmount,
  approvalCovers,
  spendingArguments,
  limitStatus,
} from "./spending-limit";
import { BUDGET_COPY as C } from "@/lib/copy/budget";

describe("spending limit transaction guards", () => {
  it.each(["0", "0.000000", "-1", "1.0000001", "NaN", "1e6"])(
    "rejects %s before encoding",
    (value) => {
      expect(() => spendingAmount(value)).toThrow(C.BAD_AMOUNT);
    },
  );
  it("keeps micro-USDC precision", () => {
    expect(spendingAmount("0.000001")).toBe(1n);
    expect(spendingAmount("20.123456")).toBe(20_123_456n);
  });
  it.each([0, 3599, 3600.5, 2592001, NaN])("rejects period %s", (period) => {
    expect(() => spendingArguments("20", period, "20")).toThrow(C.BAD_PERIOD);
  });
  it.each([null, "unavailable", "19.999999"])(
    "blocks an unconfirmed/short approval: %s",
    (approved) => {
      expect(approvalCovers(approved, "20")).toBe(false);
      expect(() => spendingArguments("20", 86400, approved)).toThrow(
        C.APPROVAL_REQUIRED,
      );
    },
  );
  it("accepts exact approval and both on-chain period boundaries", () => {
    expect(spendingArguments("20", 3600, "20")).toEqual({
      amount: 20_000_000n,
      period: 3600n,
    });
    expect(spendingArguments("20", 2592000, "21").period).toBe(2592000n);
  });
});

describe("limitStatus", () => {
  const set = { perPeriod: "20", period: 86400, remaining: "5" };
  it("is none without a limit on chain", () => {
    expect(limitStatus(null, "20", 86400)).toBe("none");
  });
  it("is active when the selection is the limit on chain and has room", () => {
    expect(limitStatus(set, "20", 86400)).toBe("active");
    expect(limitStatus(set, "20.000000", 86400)).toBe("active");
  });
  it("is used_up when that limit is spent for this window", () => {
    expect(limitStatus({ ...set, remaining: "0" }, "20", 86400)).toBe("used_up");
  });
  it("is change when the amount or the period differs", () => {
    expect(limitStatus(set, "25", 86400)).toBe("change");
    expect(limitStatus(set, "20", 3600)).toBe("change");
    expect(limitStatus(set, "", 86400)).toBe("change");
  });
});
