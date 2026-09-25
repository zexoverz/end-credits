import { describe, expect, it } from "vitest";
import { OWNER_COPY } from "../copy/owner";
import { MESSAGES } from "../messages";
import {
  devLoginErrorText,
  keyCommand,
  parseSettingsForm,
  settingsErrors,
  settingsToForm,
  signInFailureText,
  sortHolds,
  type PendingHold,
  type SettingsForm,
} from "./owner";

const form = (over: Partial<SettingsForm> = {}): SettingsForm => ({
  sessionBudget: "2",
  packageCap: "0.25",
  dailyLimit: "20",
  holdTtlMinutes: "1440",
  settleMode: "on_open",
  ...over,
});

describe("settings form", () => {
  it("round-trips the API view with the TTL in minutes", () => {
    const f = settingsToForm({
      sessionBudget: "2",
      packageCap: "0.25",
      dailyLimit: "20",
      holdTtlSeconds: 86_400,
      settleMode: "auto",
    });
    expect(f.holdTtlMinutes).toBe("1440");
    expect(parseSettingsForm(f)).toEqual({
      ok: true,
      body: { sessionBudget: "2", packageCap: "0.25", dailyLimit: "20", holdTtlSeconds: 86_400, settleMode: "auto" },
    });
  });

  it("trims amounts", () => {
    const r = parseSettingsForm(form({ packageCap: " 0.5 " }));
    expect(r.ok && r.body.packageCap).toBe("0.5");
  });

  it("rejects malformed amounts per field", () => {
    const r = parseSettingsForm(form({ sessionBudget: "1e3", dailyLimit: "0.1234567" }));
    expect(r).toEqual({ ok: false, errors: { sessionBudget: OWNER_COPY.ERR_USDC, dailyLimit: OWNER_COPY.ERR_USDC } });
  });

  it("rejects a TTL outside 1 to 10080 whole minutes", () => {
    for (const v of ["0", "10081", "1.5", "", "abc"]) {
      const r = parseSettingsForm(form({ holdTtlMinutes: v }));
      expect(r).toEqual({ ok: false, errors: { holdTtlSeconds: OWNER_COPY.ERR_TTL } });
    }
    expect(parseSettingsForm(form({ holdTtlMinutes: "10080" })).ok).toBe(true);
  });
});

describe("settingsErrors", () => {
  it("takes the first issue per field and names cap_over_budget", () => {
    expect(
      settingsErrors({
        error: "invalid_body",
        issues: { sessionBudget: ["0.01 to 100 USDC", "x"], packageCap: ["cap_over_budget"] },
      }),
    ).toEqual({ sessionBudget: "0.01 to 100 USDC", packageCap: OWNER_COPY.ERR_CAP_OVER_BUDGET });
  });
  it("is empty without issues", () => {
    expect(settingsErrors(null)).toEqual({});
    expect(settingsErrors({ error: "invalid_body" })).toEqual({});
  });
});

describe("signInFailureText", () => {
  it("maps each sign-in callback code", () => {
    expect(signInFailureText(null)).toBeNull();
    expect(signInFailureText("CANCELLED")).toBe(MESSAGES.CANCELLED);
    expect(signInFailureText("WRONG_HUMAN")).toBe(MESSAGES.WRONG_HUMAN);
    expect(signInFailureText("STATE")).toBe(OWNER_COPY.WORLD_STATE);
    expect(signInFailureText("NO_OWNER")).toBe(OWNER_COPY.WORLD_NO_OWNER);
    expect(signInFailureText("ACR")).toBe(MESSAGES.ACR);
    expect(signInFailureText("SIG")).toBe(MESSAGES.VERIFY_FAILED);
    expect(signInFailureText("<script>")).toBe(MESSAGES.VERIFY_FAILED);
  });
});

describe("devLoginErrorText", () => {
  it("maps the dev login errors", () => {
    expect(devLoginErrorText(401, { error: "unauthorized" })).toBe(OWNER_COPY.DEV_BAD_TOKEN);
    expect(devLoginErrorText(403, { error: "world_required" })).toBe(OWNER_COPY.DEV_WORLD_REQUIRED);
    expect(devLoginErrorText(404, { error: "no_owner" })).toBe(OWNER_COPY.DEV_NO_OWNER);
    expect(devLoginErrorText(500, null)).toBe("Sign-in failed (HTTP 500).");
  });
});

describe("keyCommand", () => {
  it("is the CLI key command", () => {
    expect(keyCommand("ec_abc")).toBe("endcredits key ec_abc");
  });
});

describe("sortHolds", () => {
  const h = (tipId: string, expiresAt: string, expired = false): PendingHold => ({
    tipId,
    sessionId: "s",
    package: "p",
    amount: "1",
    payee: null,
    reason: null,
    expiresAt,
    expired,
  });
  it("puts live holds first, soonest to expire first", () => {
    const sorted = sortHolds([
      h("late", "2026-09-27T00:00:00Z"),
      h("gone", "2026-09-25T00:00:00Z", true),
      h("soon", "2026-09-26T13:00:00Z"),
    ]);
    expect(sorted.map((x) => x.tipId)).toEqual(["soon", "late", "gone"]);
  });
});
