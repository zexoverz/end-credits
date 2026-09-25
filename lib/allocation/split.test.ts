import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DUST_FLOOR, split } from "./split";

const USDC = 1_000_000n;

describe("split: deterministic cases", () => {
  it("splits proportionally when nothing reaches the cap", () => {
    const r = split(new Map([["a", 3], ["b", 1]]), 1n * USDC, 1n * USDC);
    expect(r.get("a")).toEqual({ amount: 750_000n, capped: false, dust: false });
    expect(r.get("b")).toEqual({ amount: 250_000n, capped: false, dust: false });
  });

  it("caps the big one and water-fills the rest", () => {
    // 2.00 budget, 1.00 cap: a would get 1.60, is capped at 1.00; b and c share the other 1.00
    const r = split(new Map([["a", 8], ["b", 1], ["c", 1]]), 2n * USDC, 1n * USDC);
    expect(r.get("a")).toEqual({ amount: 1_000_000n, capped: true, dust: false });
    expect(r.get("b")).toEqual({ amount: 500_000n, capped: false, dust: false });
    expect(r.get("c")).toEqual({ amount: 500_000n, capped: false, dust: false });
  });

  it("leaves the leftover unspent when every package is capped", () => {
    // demo defaults: 2.00 budget, 0.25 cap, three packages
    const r = split(new Map([["a", 10], ["b", 5], ["c", 1]]), 2n * USDC, 250_000n);
    for (const k of ["a", "b", "c"]) {
      expect(r.get(k)).toEqual({ amount: 250_000n, capped: true, dust: false });
    }
    const spent = [...r.values()].reduce((s, v) => s + v.amount, 0n);
    expect(spent).toBe(750_000n);
  });

  it("marks shares under 0.01 USDC as dust with amount 0", () => {
    const r = split(new Map([["big", 1000], ["tiny", 1]]), 1n * USDC, 1n * USDC);
    // tiny would get floor(1e6 / 1001) = 999 micro
    expect(r.get("tiny")).toEqual({ amount: 0n, capped: false, dust: true });
    expect(r.get("big")?.amount).toBe(999_000n);
  });

  it("drops zero scores and handles an empty set", () => {
    const r = split(new Map([["a", 0], ["b", 2]]), 1n * USDC, 1n * USDC);
    expect([...r.keys()]).toEqual(["b"]);
    expect(split(new Map(), 1n * USDC, 1n * USDC).size).toBe(0);
  });

  it("a zero budget is all dust", () => {
    const r = split(new Map([["a", 1]]), 0n, 1n * USDC);
    expect(r.get("a")).toEqual({ amount: 0n, capped: false, dust: true });
  });

  it("rejects non-integer scores and negative money", () => {
    expect(() => split(new Map([["a", 1.5]]), USDC, USDC)).toThrow();
    expect(() => split(new Map([["a", 1]]), -1n, USDC)).toThrow();
    expect(() => split(new Map([["a", 1]]), USDC, -1n)).toThrow();
  });
});

const scoresArb = fc
  .dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.integer({ min: 0, max: 200 }), {
    minKeys: 1,
    maxKeys: 25,
  })
  .map((d) => new Map(Object.entries(d)));
const budgetArb = fc.bigInt({ min: 0n, max: 20n * USDC });
const capArb = fc.bigInt({ min: 1n, max: 5n * USDC });

describe("split: properties (DESIGN §7.1)", () => {
  it("never spends more than the budget", () => {
    fc.assert(
      fc.property(scoresArb, budgetArb, capArb, (scores, budget, cap) => {
        const total = [...split(scores, budget, cap).values()].reduce((s, v) => s + v.amount, 0n);
        expect(total <= budget).toBe(true);
      }),
    );
  });

  it("never pays a package more than the cap", () => {
    fc.assert(
      fc.property(scoresArb, budgetArb, capArb, (scores, budget, cap) => {
        for (const v of split(scores, budget, cap).values()) expect(v.amount <= cap).toBe(true);
      }),
    );
  });

  it("never sends a nonzero amount under the dust floor", () => {
    fc.assert(
      fc.property(scoresArb, budgetArb, capArb, (scores, budget, cap) => {
        for (const v of split(scores, budget, cap).values()) {
          expect(v.amount === 0n || v.amount >= DUST_FLOOR).toBe(true);
          expect(v.dust).toBe(v.amount === 0n);
        }
      }),
    );
  });

  it("with no cap hit, each amount is its exact share floored (within 1 micro)", () => {
    fc.assert(
      fc.property(scoresArb, budgetArb, (scores, budget) => {
        const cap = budget + 1n; // unreachable
        const r = split(scores, budget, cap);
        const total = BigInt([...r.keys()].reduce((s, k) => s + scores.get(k)!, 0));
        for (const [k, v] of r) {
          expect(v.capped).toBe(false);
          if (v.dust) continue;
          const exact = budget * BigInt(scores.get(k)!); // share × total
          expect(v.amount * total <= exact && exact < (v.amount + 1n) * total).toBe(true);
        }
      }),
    );
  });

  it("adding score to one package never lowers its amount", () => {
    fc.assert(
      fc.property(
        scoresArb,
        budgetArb,
        capArb,
        fc.nat(),
        fc.integer({ min: 1, max: 500 }),
        (scores, budget, cap, pick, extra) => {
          const keys = [...scores.keys()];
          const k = keys[pick % keys.length];
          const before = split(scores, budget, cap).get(k)?.amount ?? 0n;
          const more = new Map(scores).set(k, scores.get(k)! + extra);
          const after = split(more, budget, cap).get(k)!.amount;
          expect(after >= before).toBe(true);
        },
      ),
    );
  });
});
