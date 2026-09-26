import { describe, expect, it } from "vitest";
import { holdReasonText } from "./reasons";

describe("holdReasonText", () => {
  it("finds a no-history hold behind other reasons", () => {
    const reasons = [
      { source: "intercepta", code: "SCREENED_AS", text: "screened as" },
      { source: "intercepta", code: "HELD_NO_HISTORY", text: "no history" },
    ];
    expect(holdReasonText(reasons)).toBe("no history");
  });
});
