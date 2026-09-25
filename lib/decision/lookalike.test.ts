import { describe, expect, it } from "vitest";
import { findLookalike } from "./lookalike";

const KNOWN = "0xAbCd111111111111111111111111111111119876";
const known = [{ address: KNOWN, pkg: "@endcredits-demo/real" }] as const;

describe("findLookalike", () => {
  it("flags a different address with the same first 4 and last 4 hex", () => {
    const fake = "0xabcd222222222222222222222222222222229876";
    expect(findLookalike(fake, [...known])).toEqual({ of: KNOWN, pkg: "@endcredits-demo/real" });
  });

  it("does not flag the same address in another case", () => {
    expect(findLookalike(KNOWN.toLowerCase() as `0x${string}`, [...known])).toBeNull();
  });

  it("needs both ends to match", () => {
    expect(findLookalike("0xabcd222222222222222222222222222222229875", [...known])).toBeNull();
    expect(findLookalike("0xabce222222222222222222222222222222229876", [...known])).toBeNull();
  });
});
