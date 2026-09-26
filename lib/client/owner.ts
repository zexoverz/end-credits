// Client logic for /owner: settings form parsing, API errors → field text, sign-in failure text.
import { OWNER_COPY } from "../copy/owner";
import { msg } from "../messages";
import { worldFailureText } from "./approve";

export interface SettingsView {
  sessionBudget: string;
  packageCap: string;
  dailyLimit: string;
  holdTtlSeconds: number;
  settleMode: string;
}

export interface PendingHold {
  tipId: string;
  sessionId: string;
  package: string;
  amount: string;
  payee: string | null;
  reason: string | null;
  expiresAt: string;
  expired: boolean;
}

/** GET /api/owner (lib/owner/summary.ts). */
export interface OwnerSummary {
  owner: { id: string; displayName: string };
  approver?: string | null;
  settings: SettingsView;
  payer: { address: string; usdcBalance: string | null; error: string | null };
  pendingHolds: PendingHold[];
  notifications: {
    unread: number;
    items: { id: string; kind: string; holdId: string | null; tipId: string | null; createdAt: string }[];
  };
}

export interface KeyView {
  id: string;
  label: string;
  boundVia: string;
  createdAt: string;
  revokedAt: string | null;
}

export type SettingsField = "sessionBudget" | "packageCap" | "dailyLimit" | "holdTtlSeconds" | "settleMode";

/** What the form holds: USDC strings, the TTL in minutes, the settle mode. */
export interface SettingsForm {
  sessionBudget: string;
  packageCap: string;
  dailyLimit: string;
  holdTtlMinutes: string;
  settleMode: string;
}

export type SettingsBody = Omit<SettingsView, "settleMode"> & { settleMode: "auto" | "on_open" };

const USDC = /^\d{1,9}(\.\d{1,6})?$/;
const TTL_MAX_MINUTES = 7 * 24 * 60;

export function settingsToForm(s: SettingsView): SettingsForm {
  return {
    sessionBudget: s.sessionBudget,
    packageCap: s.packageCap,
    dailyLimit: s.dailyLimit,
    holdTtlMinutes: String(Math.round(s.holdTtlSeconds / 60)),
    settleMode: s.settleMode,
  };
}

/**
 * The PUT body, or per-field errors for what is malformed. Range checks (0.01 to 100, cap under the
 * budget) are the server's; its answer is shown through `settingsErrors`.
 */
export function parseSettingsForm(
  f: SettingsForm,
): { ok: true; body: SettingsBody } | { ok: false; errors: Partial<Record<SettingsField, string>> } {
  const errors: Partial<Record<SettingsField, string>> = {};
  const usdc = (field: "sessionBudget" | "packageCap" | "dailyLimit") => {
    const v = f[field].trim();
    if (!USDC.test(v)) errors[field] = OWNER_COPY.ERR_USDC;
    return v;
  };
  const sessionBudget = usdc("sessionBudget");
  const packageCap = usdc("packageCap");
  const dailyLimit = usdc("dailyLimit");
  const minutes = Number(f.holdTtlMinutes.trim());
  if (!/^\d+$/.test(f.holdTtlMinutes.trim()) || minutes < 1 || minutes > TTL_MAX_MINUTES) {
    errors.holdTtlSeconds = OWNER_COPY.ERR_TTL;
  }
  const settleMode = f.settleMode === "auto" ? "auto" : "on_open";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: { sessionBudget, packageCap, dailyLimit, holdTtlSeconds: minutes * 60, settleMode },
  };
}

/** A 400 `{error: "invalid_body", issues: {field: [text]}}` as one line per field. */
export function settingsErrors(body: unknown): Partial<Record<SettingsField, string>> {
  const issues = (body as { issues?: unknown } | null)?.issues;
  if (!issues || typeof issues !== "object") return {};
  const out: Partial<Record<SettingsField, string>> = {};
  for (const [field, list] of Object.entries(issues as Record<string, unknown>)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const text = String(list[0]);
    out[field as SettingsField] = text === "cap_over_budget" ? OWNER_COPY.ERR_CAP_OVER_BUDGET : text;
  }
  return out;
}

/** `/owner?world=<CODE>` after a failed World sign-in. */
export function signInFailureText(code: string | null): string | null {
  if (!code) return null;
  if (code === "STATE") return OWNER_COPY.WORLD_STATE;
  if (code === "NO_OWNER") return OWNER_COPY.WORLD_NO_OWNER;
  // MESSAGES.WRONG_HUMAN speaks of an approval; at sign-in it is the account.
  if (code === "WRONG_HUMAN") return OWNER_COPY.WORLD_WRONG_HUMAN;
  return worldFailureText(code) ?? msg("VERIFY_FAILED");
}

/** POST /api/auth/dev failures. */
export function devLoginErrorText(status: number, body: unknown): string {
  const error = (body as { error?: string } | null)?.error;
  if (status === 401) return OWNER_COPY.DEV_BAD_TOKEN;
  if (error === "world_required") return OWNER_COPY.DEV_WORLD_REQUIRED;
  if (error === "no_owner") return OWNER_COPY.DEV_NO_OWNER;
  return OWNER_COPY.DEV_FAILED.replace("{error}", error ?? `HTTP ${status}`);
}

/** What the agent's machine runs to store a new key. */
export const keyCommand = (token: string) => `endcredits key ${token}`;

/** Holds soonest to expire first; already expired ones last. */
export function sortHolds(holds: PendingHold[]): PendingHold[] {
  return [...holds].sort(
    (a, b) => Number(a.expired) - Number(b.expired) || Date.parse(a.expiresAt) - Date.parse(b.expiresAt),
  );
}
