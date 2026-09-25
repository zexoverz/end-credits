import { describe, expect, it } from "vitest";
import { packageKey, tipId } from "./keys";

// Expected values computed with Foundry `cast keccak` / `cast abi-encode`, independent of viem.
describe("keys", () => {
  it("packageKey = keccak256(encodePacked('npm:', name))", () => {
    expect(packageKey("zod")).toBe(
      "0xbf0135b33430db8ae534b6d7165a4de5c45892c4a69041abe7316b150d88f338",
    );
    expect(packageKey("@tanstack/react-query")).toBe(
      "0xc40acef7f86fdace3af5b1ed798edb432082da77cb772ac40a3eb87b0d4e5b1c",
    );
  });

  it("tipId = keccak256(abi.encode(sessionKey, packageKey))", () => {
    expect(tipId(`0x${"11".repeat(32)}`, packageKey("zod"))).toBe(
      "0xfa1d07678a9bc1d875d51e64725fbf2e47d9aeeeb7e825261e14653825919e5e",
    );
  });
});
