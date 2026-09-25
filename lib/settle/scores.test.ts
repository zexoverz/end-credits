import { describe, expect, it } from "vitest";
import { scoreUsage } from "./scores";

const row = (packageName: string, signal: string, count: number) => ({ packageName, signal, count });

describe("scoreUsage", () => {
  it("weights each signal and caps its count (DESIGN §5)", () => {
    const out = scoreUsage([row("zod", "import", 9), row("zod", "read", 3), row("zod", "dep_added", 4)]);
    // import 3 × min(9, 5) + read 1 × 3 + dep_added 5 × min(4, 1)
    expect(out).toEqual([{ name: "zod", score: 15 + 3 + 5, role: "starring" }]);
  });

  it("stars the top three and gives the rest the role of their lead signal", () => {
    const out = scoreUsage([
      row("a", "import", 5),
      row("b", "import", 4),
      row("c", "import", 3),
      row("d", "docs", 2),
      row("e", "read", 3),
      row("f", "import", 1),
    ]);
    expect(out.map((p) => [p.name, p.score, p.role])).toEqual([
      ["a", 15, "starring"],
      ["b", 12, "starring"],
      ["c", 9, "starring"],
      ["d", 4, "research"],
      ["e", 3, "thanks"],
      ["f", 3, "featuring"],
    ]);
  });

  it("drops unknown signals and zero scores", () => {
    expect(scoreUsage([row("a", "stars", 5), row("b", "read", 0)])).toEqual([]);
  });
});
