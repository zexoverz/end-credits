import { describe, expect, it } from "vitest";
import {
  BASE_MAINNET,
  BASE_SEPOLIA,
  BASE_SEPOLIA_USDC,
  BASE_USDC,
  isPinnedUsdc,
  mapChain,
  mapToken,
  screenedAsReason,
} from "./mapping";

describe("mapping", () => {
  it("screens Base Sepolia as Base mainnet and says where it came from", () => {
    expect(mapChain(BASE_SEPOLIA)).toEqual({ chainId: 8453, mappedFrom: "eip155:84532" });
  });

  it("leaves Base mainnet alone", () => {
    expect(mapChain(BASE_MAINNET)).toEqual({ chainId: 8453, mappedFrom: null });
  });

  it("refuses a chain Intercepta has no equivalent for", () => {
    expect(() => mapChain(11155111)).toThrow("No screening chain for 11155111");
  });

  it("screens Base Sepolia USDC as Base USDC", () => {
    expect(mapToken(BASE_SEPOLIA_USDC.toLowerCase() as `0x${string}`, BASE_SEPOLIA)).toEqual({
      address: BASE_USDC,
      chainId: 8453,
      mappedFrom: `eip155:84532/${BASE_SEPOLIA_USDC.toLowerCase()}`,
    });
  });

  it("does not map an unknown testnet token to anything", () => {
    expect(() =>
      mapToken("0x1111111111111111111111111111111111111111", BASE_SEPOLIA),
    ).toThrow("No mainnet equivalent for token");
  });

  it("pins the payment token to Base Sepolia USDC, case-insensitively", () => {
    expect(isPinnedUsdc(BASE_SEPOLIA_USDC)).toBe(true);
    expect(isPinnedUsdc(BASE_SEPOLIA_USDC.toLowerCase() as `0x${string}`)).toBe(true);
    expect(isPinnedUsdc(BASE_USDC)).toBe(false);
  });

  it("builds the SCREENED_AS note from messages", () => {
    expect(screenedAsReason()).toEqual({
      source: "intercepta",
      code: "SCREENED_AS",
      text: "Screened as its mainnet equivalent (Base, chain 8453).",
    });
  });
});
