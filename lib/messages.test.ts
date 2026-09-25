import { describe, expect, it } from "vitest";
import { MESSAGES, msg } from "./messages";

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

  it("has every code from DESIGN §11, plus NOT_PAYABLE (E5)", () => {
    expect(Object.keys(MESSAGES)).toHaveLength(39);
  });
});
