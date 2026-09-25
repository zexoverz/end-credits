import { describe, expect, it } from "vitest";
import { MESSAGES, cliMsg, msg } from "./messages";

describe("msg", () => {
  it("fills every placeholder", () => {
    expect(msg("PAID", { amount: "0.25" })).toBe("Paid 0.25 USDC.");
  });

  it("throws on a missing variable instead of printing the placeholder", () => {
    expect(() => msg("PAID", {})).toThrow("Missing message var: amount in PAID");
  });

  it("returns fixed strings without vars", () => {
    expect(msg("NOT_A_PAYWALL")).toBe(
      "End Credits is opt-in for whoever runs the agent. Packages stay free for everyone.",
    );
  });

  it("has every code from DESIGN §11, plus SPOOF_REPO (T2.5)", () => {
    expect(Object.keys(MESSAGES)).toHaveLength(39);
  });

  it("names the repo and package in SPOOF_REPO", () => {
    expect(msg("SPOOF_REPO", { repo: "prettier/prettier", package: "prettier-plus" })).toBe(
      "Reserved: prettier/prettier does not publish prettier-plus.",
    );
  });
});

describe("cliMsg", () => {
  it("formats CLI strings with the same placeholder rule", () => {
    expect(cliMsg("ROLLING", { url: "https://x/credits/1" })).toBe(
      "End Credits: rolling credits at https://x/credits/1",
    );
    expect(() => cliMsg("ROLLING", {})).toThrow("Missing message var: url in ROLLING");
  });
});
