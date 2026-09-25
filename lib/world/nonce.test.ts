import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { approvalNonce, canonicalJson, type ApprovalPayload } from "./nonce";

const payload: ApprovalPayload = {
  tipId: `0x${"ab".repeat(32)}`,
  packageKey: `0x${"cd".repeat(32)}`,
  payee: "0x1234567890AbcdEF1234567890aBcdef12345678",
  amount: "150000",
  action: "release",
  text_version: "v1",
  owner_sub_hash: `0x${"ef".repeat(32)}`,
  attempt: "11111111-1111-4111-8111-111111111111",
};

describe("canonicalJson", () => {
  it("sorts keys at every level, no whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: "x" } })).toBe(
      '{"a":{"c":"x","d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe("approvalNonce", () => {
  it("is base64url(sha256(canonical_json(payload) || salt))", () => {
    const expected = createHash("sha256")
      .update(canonicalJson({ ...payload }) + "salt")
      .digest("base64url");
    expect(approvalNonce(payload, "salt")).toBe(expected);
    expect(approvalNonce(payload, "salt")).toMatch(/^[\w-]{43}$/);
  });

  it("does not depend on key order", () => {
    const reordered = Object.fromEntries(Object.entries(payload).reverse()) as unknown as ApprovalPayload;
    expect(approvalNonce(reordered, "salt")).toBe(approvalNonce(payload, "salt"));
  });

  it("changes with any field and with the salt", () => {
    const base = approvalNonce(payload, "salt");
    for (const key of Object.keys(payload) as (keyof ApprovalPayload)[]) {
      expect(approvalNonce({ ...payload, [key]: `${payload[key]}x` }, "salt")).not.toBe(base);
    }
    expect(approvalNonce(payload, "other")).not.toBe(base);
  });
});
