import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { derivePayerKey, payerAddressFor, payerKeyFor, PayerMismatchError } from "./payers";

const MASTER = `0x${"11".repeat(32)}` as const;
const env = { PAYER_PRIVATE_KEY: MASTER };
const masterAddress = privateKeyToAccount(MASTER).address;

describe("per-owner payer keys", () => {
  it("derives a different, stable key per owner", () => {
    const a = derivePayerKey(MASTER, "owner-a");
    expect(derivePayerKey(MASTER, "owner-a")).toBe(a);
    expect(derivePayerKey(MASTER, "owner-b")).not.toBe(a);
    expect(a).not.toBe(MASTER);
  });

  it("gives the first owner, stored with the master address, the master key", () => {
    expect(payerKeyFor({ id: "seed", payerAddress: masterAddress }, env)).toBe(MASTER);
  });

  it("gives a new owner its derived key", () => {
    const payerAddress = payerAddressFor("owner-a", env);
    expect(payerAddress).not.toBe(masterAddress);
    expect(payerKeyFor({ id: "owner-a", payerAddress }, env)).toBe(derivePayerKey(MASTER, "owner-a"));
  });

  it("refuses a stored payer that belongs to another owner", () => {
    const payerAddress = payerAddressFor("owner-a", env);
    expect(() => payerKeyFor({ id: "owner-b", payerAddress }, env)).toThrow(PayerMismatchError);
  });
});
