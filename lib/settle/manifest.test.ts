import { keccak256, stringToBytes } from "viem";
import { describe, expect, it } from "vitest";
import { canonicalJson, manifestOf } from "./manifest";

describe("canonicalJson", () => {
  it("sorts keys at every depth and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("writes bigints as decimal strings", () => {
    expect(canonicalJson({ amount: BigInt(250000) })).toBe('{"amount":"250000"}');
  });
});

describe("manifestOf", () => {
  it("orders credits by package and hashes the canonical JSON", () => {
    const credits = [
      { package: "zod", amount: BigInt(1), outcome: "paid", payee: "0xA", tx: "0x1" },
      { package: "a", amount: BigInt(2), outcome: "refused", payee: null, tx: null },
    ];
    const { json, hash } = manifestOf(credits);
    expect(json).toBe(
      '[{"amount":"2","outcome":"refused","package":"a","payee":null,"tx":null},' +
        '{"amount":"1","outcome":"paid","package":"zod","payee":"0xA","tx":"0x1"}]',
    );
    expect(hash).toBe(keccak256(stringToBytes(json)));
  });
});
