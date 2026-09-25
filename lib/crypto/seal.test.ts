import { describe, expect, it } from "vitest";
import { seal, unseal } from "./seal";

const SECRET = "a-session-secret-that-is-32-bytes-long!!";

describe("seal / unseal", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = seal("gho_token123", SECRET);
    expect(sealed).not.toContain("gho_token123");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(unseal(sealed, SECRET)).toBe("gho_token123");
  });

  it("uses a fresh IV each time", () => {
    expect(seal("x", SECRET)).not.toBe(seal("x", SECRET));
  });

  it("rejects a tampered ciphertext", () => {
    const [v, iv, ct, tag] = seal("gho_token123", SECRET).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(() => unseal([v, iv, flipped.toString("base64url"), tag].join("."), SECRET)).toThrow();
  });

  it("rejects another secret", () => {
    expect(() => unseal(seal("t", SECRET), "another-secret-that-is-32-bytes-long!!!")).toThrow();
  });

  it("rejects a malformed value", () => {
    expect(() => unseal("nope", SECRET)).toThrow("Malformed sealed value");
  });
});
