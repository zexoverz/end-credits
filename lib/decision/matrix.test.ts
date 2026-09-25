// One test per step of DESIGN §8 plus the order tests from §17. Package names are fixtures only
// (AGENTS rule 9).
import { describe, expect, it } from "vitest";
import { decide, type DecideInput } from "./matrix";
import type { Screen } from "./types";

const PAYEE = "0x1234560000000000000000000000000000000001";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PKG = "@endcredits-demo/fixture";

const cleanScreen: Screen = { toxicScore: 0, traits: [], tokenAction: "info", tokenDetectors: [], impersonation: null };

function input(over: Partial<DecideInput> = {}, screen: Partial<Screen> = {}): DecideInput {
  return {
    pkg: PKG,
    payee: PAYEE,
    paymentToken: USDC,
    screen: { ...cleanScreen, ...screen },
    capped: false,
    amount: BigInt(250000),
    change: { changed: false },
    lookalike: null,
    spam: null,
    noCodeOnBase: false,
    ...over,
  };
}

const codes = (d: ReturnType<typeof decide>) => d.reasons.map((r) => r.code);

describe("decide: one test per step", () => {
  it("1. no payee -> reserved", () => {
    const d = decide(input({ payee: null, screen: null }));
    expect(d.outcome).toBe("reserved");
    expect(codes(d)).toEqual(["RESERVED"]);
    expect(d.reasons[0].text).toBe(
      "Reserved 0.25 USDC for @endcredits-demo/fixture. No wallet yet; the maintainer can claim it.",
    );
  });

  it("2. payment token not Base Sepolia USDC -> refused TOKEN_PIN", () => {
    const d = decide(input({ paymentToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }));
    expect(d.outcome).toBe("refused");
    expect(codes(d)).toContain("TOKEN_PIN");
  });

  it("2. token action block -> refused with the detector text verbatim", () => {
    const d = decide(input({}, { tokenAction: "block", tokenDetectors: [{ code: "FAKE_TOKEN", description: "Fake token" }] }));
    expect(d.outcome).toBe("refused");
    expect(d.reasons[0]).toEqual({ source: "intercepta", code: "REFUSED_TRAIT", text: "Refused. Intercepta: Fake token" });
  });

  it("3. screen error -> held SCREEN_UNAVAILABLE", () => {
    const d = decide(input({}, { error: "TIMEOUT" }));
    expect(d.outcome).toBe("held");
    expect(d.holdReason).toBe("SCREEN");
    expect(d.reasons[0]).toMatchObject({ code: "SCREEN_UNAVAILABLE", text: expect.stringContaining("(TIMEOUT)") });
  });

  it("3. a payee with no screen at all -> held, never paid", () => {
    const d = decide(input({ screen: null }));
    expect(d.outcome).toBe("held");
    expect(codes(d)).toEqual(["SCREEN_UNAVAILABLE"]);
  });

  it("4. critical trait -> refused with Intercepta's description verbatim", () => {
    const d = decide(input({}, { toxicScore: 10, traits: [{ name: "sanction_address", description: "Sanctioned by OFAC" }] }));
    expect(d.outcome).toBe("refused");
    expect(d.reasons[0]).toEqual({ source: "intercepta", code: "REFUSED_TRAIT", text: "Refused. Intercepta: Sanctioned by OFAC" });
  });

  it("4. every critical trait name refuses", () => {
    for (const name of ["sanction_address", "known_scammer", "blacklist", "fake_phishing_transfer"]) {
      expect(decide(input({}, { traits: [{ name, description: name }] })).outcome).toBe("refused");
    }
  });

  it("4. a scam detector from the simulation fallback refuses", () => {
    const d = decide(input({}, { traits: [{ name: "SCAM_ADDRESS", description: "Scam address" }] }));
    expect(d.outcome).toBe("refused");
  });

  it("4. toxic score above 50 -> refused", () => {
    const d = decide(input({}, { toxicScore: 51, traits: [{ name: "mixer_transfers", description: "Mixer" }] }));
    expect(d.outcome).toBe("refused");
    expect(d.reasons[0].text).toBe("Refused. Intercepta: Mixer");
  });

  it("4. Intercepta impersonation -> refused IMPERSONATION", () => {
    const d = decide(input({}, { impersonation: { original: "0xabc" } }));
    expect(d.outcome).toBe("refused");
    expect(d.reasons[0]).toMatchObject({ source: "intercepta", code: "IMPERSONATION" });
  });

  it("4. our lookalike rule -> refused LOOKALIKE", () => {
    const d = decide(input({ lookalike: { of: "0x1234aa0000000000000000000000000000000001", pkg: "@endcredits-demo/real" } }));
    expect(d.outcome).toBe("refused");
    expect(d.reasons[0]).toMatchObject({ source: "policy", code: "LOOKALIKE" });
  });

  it("4. spam at 5 packages -> refused SPAM; 4 is not", () => {
    expect(codes(decide(input({ spam: { count: 5 } })))).toContain("SPAM");
    expect(decide(input({ spam: { count: 5 } })).outcome).toBe("refused");
    expect(decide(input({ spam: { count: 4 } })).outcome).toBe("paid");
  });

  it("5. address changed recently -> held HELD_CHANGED", () => {
    const d = decide(input({ change: { changed: true, days: 3 } }));
    expect(d.outcome).toBe("held");
    expect(d.holdReason).toBe("ADDRESS_CHANGED");
    expect(d.reasons[0]).toMatchObject({ source: "payee", code: "HELD_CHANGED" });
    expect(d.reasons[0].text).toContain("changed 3 days ago");
  });

  it("6. toxic score 20..50 -> held HELD_MEDIUM; 19 is paid", () => {
    for (const s of [20, 50]) {
      const d = decide(input({}, { toxicScore: s }));
      expect(d.outcome).toBe("held");
      expect(d.holdReason).toBe("MEDIUM");
      expect(codes(d)).toContain("HELD_MEDIUM");
    }
    expect(decide(input({}, { toxicScore: 19 })).outcome).toBe("paid");
  });

  it("6. token action warn -> held HELD_MEDIUM", () => {
    const d = decide(input({}, { tokenAction: "warn" }));
    expect(d.outcome).toBe("held");
    expect(codes(d)).toContain("HELD_MEDIUM");
  });

  it("7. contract on Ethereum with no code on Base -> held HELD_NO_CODE", () => {
    const d = decide(input({ noCodeOnBase: true }));
    expect(d.outcome).toBe("held");
    expect(d.holdReason).toBe("NO_CODE");
    expect(codes(d)).toContain("HELD_NO_CODE");
  });

  it("8. capped -> capped CAPPED", () => {
    const d = decide(input({ capped: true }));
    expect(d.outcome).toBe("capped");
    expect(d.reasons[0].text).toBe("Capped at 0.25 USDC, the per-package limit for this session.");
  });

  it("8. otherwise -> paid PAID, with SCREENED_AS", () => {
    const d = decide(input());
    expect(d.outcome).toBe("paid");
    expect(codes(d)).toEqual(["PAID", "SCREENED_AS"]);
    expect(d.reasons[0].text).toBe("Paid 0.25 USDC.");
  });
});

describe("decide: order (DESIGN §17)", () => {
  it("sanctioned and recently changed -> refused, not held", () => {
    const d = decide(input({ change: { changed: true, days: 1 } }, { traits: [{ name: "sanction_address", description: "OFAC" }] }));
    expect(d.outcome).toBe("refused");
    expect(codes(d)).not.toContain("HELD_CHANGED");
  });

  it("screen error with an otherwise clean-looking screen -> held, not paid", () => {
    const d = decide(input({}, { error: "HTTP", toxicScore: 0 }));
    expect(d.outcome).toBe("held");
    expect(codes(d)).toContain("SCREEN_UNAVAILABLE");
  });

  it("reserved is never judged on a screen", () => {
    const d = decide(input({ payee: null }, { traits: [{ name: "sanction_address", description: "OFAC" }] }));
    expect(d.outcome).toBe("reserved");
    expect(codes(d)).toEqual(["RESERVED"]);
  });

  it("wrong token beats a screen error", () => {
    const d = decide(input({ paymentToken: "0x0000000000000000000000000000000000000001" }, { error: "TIMEOUT" }));
    expect(d.outcome).toBe("refused");
    expect(codes(d)).toContain("TOKEN_PIN");
  });

  it("medium risk beats no-code, and capped never overrides a hold", () => {
    const d = decide(input({ noCodeOnBase: true, capped: true }, { toxicScore: 30 }));
    expect(d.holdReason).toBe("MEDIUM");
    expect(decide(input({ noCodeOnBase: true, capped: true })).outcome).toBe("held");
  });

  it("every outcome after a screen carries SCREENED_AS", () => {
    expect(codes(decide(input({ capped: true })))).toContain("SCREENED_AS");
    expect(codes(decide(input({ change: { changed: true, days: 2 } })))).toContain("SCREENED_AS");
    expect(codes(decide(input({}, { toxicScore: 90 })))).toContain("SCREENED_AS");
  });
});
