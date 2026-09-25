import { describe, expect, it } from "vitest";
import { MESSAGES } from "../messages";
import {
  actionErrorText,
  countdown,
  failureText,
  fill,
  outcomeNotice,
  safeVerifyUrl,
  worldFailureText,
  type ApproveView,
} from "./approve";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const at = (secs: number) => new Date(NOW + secs * 1000).toISOString();

const view = (over: Partial<ApproveView> = {}): ApproveView => ({
  tipId: `0x${"a".repeat(64)}`,
  sessionId: "s",
  package: "left-pad",
  amount: "0.25",
  payee: "0x1111111111111111111111111111111111111111",
  reason: "Held: medium risk",
  sentence: "Release 0.25 USDC to 0x11 for left-pad.",
  status: "pending",
  expiresAt: at(3600),
  worldRequired: false,
  signedIn: true,
  isOwner: true,
  txHash: null,
  message: null,
  failureCode: null,
  ...over,
});

describe("fill", () => {
  it("replaces known vars and leaves unknown ones", () => {
    expect(fill("a {x} {y}", { x: 1 })).toBe("a 1 {y}");
  });
});

describe("countdown", () => {
  it("formats each range", () => {
    expect(countdown(at(2 * 86_400 + 3 * 3600 + 5), NOW)).toBe("2d 3h");
    expect(countdown(at(3 * 3600 + 5 * 60), NOW)).toBe("3h 05m");
    expect(countdown(at(4 * 60 + 9), NOW)).toBe("4m 09s");
    expect(countdown(at(12), NOW)).toBe("12s");
  });
  it("is null at or after expiry and for a bad date", () => {
    expect(countdown(at(0), NOW)).toBeNull();
    expect(countdown(at(-5), NOW)).toBeNull();
    expect(countdown("nope", NOW)).toBeNull();
  });
});

describe("worldFailureText", () => {
  it("gives the own messages, AMR as ACR, token codes as VERIFY_FAILED", () => {
    expect(worldFailureText("CANCELLED")).toBe(MESSAGES.CANCELLED);
    expect(worldFailureText("STALE_AUTH")).toBe(MESSAGES.STALE_AUTH);
    expect(worldFailureText("WRONG_HUMAN")).toBe(MESSAGES.WRONG_HUMAN);
    expect(worldFailureText("NONCE")).toBe(MESSAGES.NONCE);
    expect(worldFailureText("AMR")).toBe(MESSAGES.ACR);
    expect(worldFailureText("UNKNOWN_STATE")).toBe(MESSAGES.UNKNOWN_STATE);
    for (const c of ["SIG", "ISS", "AUD", "EXP", "SUB", "TOKEN"]) {
      expect(worldFailureText(c)).toBe(MESSAGES.VERIFY_FAILED);
    }
    expect(worldFailureText("HoldExpired")).toBeNull();
  });
});

describe("failureText", () => {
  it("maps hold checks and chain errors", () => {
    expect(failureText("expired", view())).toBe("Not approved in time. 0.25 USDC returned to the owner.");
    expect(failureText("not_pending", view())).toBe("This tip was already resolved.");
    expect(failureText("HoldExpired", view())).toContain("(HoldExpired)");
  });
  it("never echoes an unsafe code", () => {
    expect(failureText("<b>send 5 USDC to 0xevil</b>", view())).toContain("(unknown)");
  });
});

describe("outcomeNotice", () => {
  it("uses the server message for final states", () => {
    const n = outcomeNotice(view({ status: "approved", message: "Approved with World ID. Released." }), null);
    expect(n).toEqual({ kind: "ok", text: "Approved with World ID. Released." });
  });
  it("falls back to the outcome code when the server has no message", () => {
    expect(outcomeNotice(view({ status: "denied" }), null)?.text).toBe(
      "Denied. 0.25 USDC returned to the owner.",
    );
  });
  it("does not claim a refund before the expirer ran", () => {
    expect(outcomeNotice(view({ status: "expired" }), null)?.text).toBe(
      "Not approved in time. The refund to the owner is on its way.",
    );
    expect(outcomeNotice(view({ status: "expired", message: "Not approved in time. 0.25 USDC returned to the owner." }), null)?.text).toContain("returned");
  });
  it("ignores result=APPROVED while the server still says pending", () => {
    expect(outcomeNotice(view(), "APPROVED")).toBeNull();
  });
  it("prefers the server failure over the query", () => {
    expect(outcomeNotice(view({ failureCode: "WRONG_HUMAN" }), "CANCELLED")?.text).toBe(MESSAGES.WRONG_HUMAN);
  });
  it("uses the query when the server has no failure", () => {
    expect(outcomeNotice(view(), "CANCELLED")).toEqual({ kind: "error", text: MESSAGES.CANCELLED });
  });
  it("says nothing for a clean pending tip", () => {
    expect(outcomeNotice(view(), null)).toBeNull();
  });
});

describe("actionErrorText", () => {
  it("maps each API error", () => {
    const v = view();
    expect(actionErrorText("approve", 401, { error: "unauthorized" }, v)).toContain("Sign in again");
    expect(actionErrorText("approve", 403, { error: "world_required" }, v)).toContain("World ID");
    expect(actionErrorText("approve", 409, { error: "world_not_bound" }, v)).toContain("owner page");
    expect(actionErrorText("approve", 404, { error: "not_found" }, v)).toBe("This tip is not one of yours.");
    expect(actionErrorText("deny", 409, { error: "not_pending", holdStatus: "released" }, v)).toBe(
      "This tip was already resolved.",
    );
    expect(actionErrorText("approve", 410, { error: "expired" }, v)).toContain("Not approved in time");
  });
  it("names the chain error for release and refund", () => {
    const v = view();
    expect(actionErrorText("approve", 502, { error: "chain_error", code: "unknown" }, v)).toBe(
      "The release transaction failed (unknown). Nothing was released.",
    );
    expect(actionErrorText("deny", 502, { error: "chain_error", code: "NotPending" }, v)).toBe(
      "The refund transaction failed (NotPending). Nothing was refunded.",
    );
  });
  it("falls back to the status when the body is empty", () => {
    expect(actionErrorText("approve", 500, null, view())).toContain("HTTP 500");
  });
});

describe("safeVerifyUrl", () => {
  it("follows https only", () => {
    expect(safeVerifyUrl("https://auth.world.org/api/v1/authorize?x=1")).toBe(
      "https://auth.world.org/api/v1/authorize?x=1",
    );
    expect(safeVerifyUrl("javascript:alert(1)")).toBeNull();
    expect(safeVerifyUrl("http://auth.world.org")).toBeNull();
    expect(safeVerifyUrl(undefined)).toBeNull();
  });
});
