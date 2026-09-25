import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { canonicalJson, signReceipt, verifyReceipt } from "./receipt";

const signer = privateKeyToAccount(generatePrivateKey());
const body = {
  creditId: "c1",
  package: "zod",
  amount: "10000",
  payee: "0x00000000000000000000000000000000000000aa",
  tx: "0xabc",
};

describe("receipt", () => {
  it("serialises keys in sorted order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("signs the canonical JSON and names the signer", async () => {
    const receipt = await signReceipt(body, signer);
    expect(receipt.signer).toBe(signer.address);
    expect(await verifyReceipt(receipt)).toBe(true);
  });

  it("fails verification when a field is changed", async () => {
    const receipt = await signReceipt(body, signer);
    expect(await verifyReceipt({ ...receipt, amount: "20000" })).toBe(false);
  });
});
