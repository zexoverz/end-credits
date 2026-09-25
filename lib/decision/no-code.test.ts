import { describe, expect, it } from "vitest";
import { noCodeOnBase } from "./no-code";

const reader = (code: `0x${string}` | undefined) => async () => code;

describe("noCodeOnBase (injected readers)", () => {
  it("true for a contract on Ethereum with nothing on Base", async () => {
    expect(await noCodeOnBase("0x0000000000000000000000000000000000000001", { ethereum: reader("0x6080"), base: reader(undefined) })).toBe(true);
    expect(await noCodeOnBase("0x0000000000000000000000000000000000000001", { ethereum: reader("0x6080"), base: reader("0x") })).toBe(true);
  });

  it("false when the contract also exists on Base", async () => {
    expect(await noCodeOnBase("0x0000000000000000000000000000000000000001", { ethereum: reader("0x6080"), base: reader("0x6080") })).toBe(false);
  });

  it("false for an address with no code on Ethereum", async () => {
    expect(await noCodeOnBase("0x0000000000000000000000000000000000000001", { ethereum: reader("0x"), base: reader(undefined) })).toBe(false);
  });

  it("false for an EOA with an EIP-7702 delegation on Ethereum", async () => {
    const delegated = "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b" as const;
    expect(await noCodeOnBase("0x0000000000000000000000000000000000000001", { ethereum: reader(delegated), base: reader("0x") })).toBe(false);
  });

  it("an RPC failure throws instead of guessing", async () => {
    const failing = async () => {
      throw new Error("rpc down");
    };
    await expect(noCodeOnBase("0x0000000000000000000000000000000000000001", { ethereum: failing, base: reader(undefined) })).rejects.toThrow("rpc down");
  });
});

// Live: public mainnet RPCs, no key needed. Set OFFLINE=1 to skip.
describe.skipIf(process.env.OFFLINE === "1")("noCodeOnBase (live mainnet RPCs)", () => {
  it("DAI exists on Ethereum and not on Base -> true", async () => {
    expect(await noCodeOnBase("0x6B175474E89094C44Da98b954EedeAC495271d0F")).toBe(true);
  });

  it("Multicall3 exists on both -> false", async () => {
    expect(await noCodeOnBase("0xcA11bde05977b3631167028862bE2a173976CA11")).toBe(false);
  });

  it("an EOA -> false", async () => {
    expect(await noCodeOnBase("0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6")).toBe(false);
  });
});
