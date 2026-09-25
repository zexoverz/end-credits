import { describe, expect, it } from "vitest";
import { mainSignals } from "./view";

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
