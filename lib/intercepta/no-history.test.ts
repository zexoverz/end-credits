import { describe, expect, it } from "vitest";
import { isNoHistory, NO_HISTORY_BODY } from "./no-history";

describe("isNoHistory", () => {
  it("matches the live 404 for an address with no mainnet history", () => {
    expect(isNoHistory(404, NO_HISTORY_BODY)).toBe(true);
  });

  it("matches case-insensitively and with a typographic apostrophe", () => {
    const body = { errors: [{ message: "an EXTERNALLY OWNED ACCOUNT with this address doesn’t exist." }] };
    expect(isNoHistory(404, body)).toBe(true);
  });

  it("needs status 404", () => {
    expect(isNoHistory(200, NO_HISTORY_BODY)).toBe(false);
    expect(isNoHistory(500, NO_HISTORY_BODY)).toBe(false);
  });

  it("any other 404 is not a screen", () => {
    expect(isNoHistory(404, { status: 404, response: { statusCode: 404, message: "Not Found" } })).toBe(false);
    expect(isNoHistory(404, { errors: [{ message: "Route not found" }] })).toBe(false);
    expect(isNoHistory(404, { errors: [{ message: "Token doesn't exist." }] })).toBe(false);
    expect(isNoHistory(404, { errors: [{ message: "Externally Owned Account lookup failed" }] })).toBe(false);
    expect(isNoHistory(404, "An Externally Owned Account with this address doesn't exist.")).toBe(false);
    expect(isNoHistory(404, null)).toBe(false);
  });
});
