import { describe, expect, it } from "vitest";
import { mainSignals, previewCredits } from "./view";

describe("mainSignals", () => {
  it("picks the signal with the largest weight × count per package", () => {
    const m = mainSignals([
      { packageName: "zod", signal: "read", count: 9 },
      { packageName: "zod", signal: "import", count: 4 },
      { packageName: "date-fns", signal: "read", count: 3 },
    ]);
    expect(m.get("zod")).toEqual({ signal: "import", count: 4 });
    expect(m.get("date-fns")).toEqual({ signal: "read", count: 3 });
  });

  it("prefers the heavier signal on a tie", () => {
    const m = mainSignals([
      { packageName: "a", signal: "read", count: 6 },
      { packageName: "a", signal: "import", count: 2 },
    ]);
    expect(m.get("a")).toEqual({ signal: "import", count: 2 });
  });
});

describe("previewCredits (roll before settlement)", () => {
  const rows = [
    { packageName: "zod", signal: "import", count: 1 },
    { packageName: "zod", signal: "dep_added", count: 1 },
    { packageName: "date-fns", signal: "import", count: 2 },
    { packageName: "a", signal: "read", count: 1 },
    { packageName: "b", signal: "docs", count: 1 },
    { packageName: "c", signal: "read", count: 3 },
  ];

  it("lists every used package with no outcome or amount yet, in roll order", () => {
    const out = previewCredits(rows);
    expect(out.map((c) => [c.package, c.role])).toEqual([
      ["zod", "starring"],
      ["date-fns", "starring"],
      ["c", "starring"],
      ["b", "research"],
      ["a", "thanks"],
    ]);
    expect(out.every((c) => c.outcome === null && c.amount === null && c.txHash === null)).toBe(true);
    expect(out[0].signal).toEqual({ signal: "dep_added", count: 1 });
  });

  it("is empty when nothing was used", () => {
    expect(previewCredits([])).toEqual([]);
  });
});
