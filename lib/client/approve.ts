// Client logic for /approve/[tipId]: countdown, World result codes → text, action errors → text.
// The page never decides an outcome: success is shown only when the server's view says approved.
import { APPROVE_COPY } from "../copy/approve";
import { msg, type MessageCode } from "../messages";

export type ApproveStatus = "pending" | "approved" | "denied" | "expired";

/** GET /api/approve/:tipId (lib/approve/view.ts). */
export interface ApproveView {
  tipId: string;
  sessionId: string;
  package: string;
  amount: string;
  payee: string | null;
  reason: string | null;
  sentence: string;
  status: ApproveStatus;
  expiresAt: string;
  worldRequired: boolean;
  signedIn: boolean;
  isOwner: boolean;
  txHash: string | null;
  message: string | null;
  failureCode: string | null;
}

/** "{name}" placeholders; a missing var stays visible rather than throwing in the browser. */
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** Time left as "2d 3h", "3h 05m", "4m 09s", "12s"; null once it has passed. */
export function countdown(expiresAt: string, now: number): string | null {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

// World failure codes with their own text (decisions.md E11, "For the page").
const WORLD_OWN: Record<string, MessageCode> = {
  CANCELLED: "CANCELLED",
  STALE_AUTH: "STALE_AUTH",
  WRONG_HUMAN: "WRONG_HUMAN",
  NONCE: "NONCE",
  ACR: "ACR",
  AMR: "ACR",
  UNKNOWN_STATE: "UNKNOWN_STATE",
};
const TOKEN_CODES = new Set(["SIG", "ISS", "AUD", "EXP", "SUB", "TOKEN"]);
const SAFE_CODE = /^[A-Za-z0-9_]{1,64}$/;

/** A World verification failure code as text, or null when it is not one. */
export function worldFailureText(code: string): string | null {
  if (code in WORLD_OWN) return msg(WORLD_OWN[code]);
  if (TOKEN_CODES.has(code)) return msg("VERIFY_FAILED");
  return null;
}

/**
 * The failure text for an approval attempt: a World code, the hold checks the callback repeats
 * (`not_pending`, `expired`, `not_found`), else a chain error name from the release.
 */
export function failureText(code: string, view: Pick<ApproveView, "amount">): string {
  const world = worldFailureText(code);
  if (world) return world;
  if (code === "expired") return msg("EXPIRED", { amount: view.amount });
  if (code === "not_pending") return APPROVE_COPY.ERR_NOT_PENDING;
  if (code === "not_found") return APPROVE_COPY.ERR_NOT_FOUND;
  return fill(APPROVE_COPY.ERR_RELEASE_CHAIN, { code: SAFE_CODE.test(code) ? code : "unknown" });
}

export type Notice = { kind: "ok" | "error" | "info"; text: string };

const FINAL_CODE: Record<Exclude<ApproveStatus, "pending">, MessageCode> = {
  approved: "APPROVED_SESSION",
  denied: "DENIED",
  expired: "EXPIRED",
};

/**
 * What the page says about the outcome. Final states use the server's recorded message. While
 * pending, the server's last failure wins; `?result=` only fills in when the server has none, and a
 * `result=APPROVED` the server does not confirm is ignored.
 */
export function outcomeNotice(view: ApproveView, result: string | null): Notice | null {
  if (view.status !== "pending") {
    // Past expiry but before the expirer's refund, nothing has been returned yet.
    if (view.status === "expired" && !view.message) return { kind: "info", text: APPROVE_COPY.EXPIRED_REFUND_PENDING };
    const text =
      view.message ?? msg(FINAL_CODE[view.status], { amount: view.amount, address: view.payee ?? "" });
    return { kind: view.status === "approved" ? "ok" : "info", text };
  }
  const code = view.failureCode ?? (result && result !== "APPROVED" ? result : null);
  return code ? { kind: "error", text: failureText(code, view) } : null;
}

/** The error body of POST /start or /deny as the owner should read it. */
export function actionErrorText(
  action: "approve" | "deny",
  status: number,
  body: unknown,
  view: Pick<ApproveView, "amount">,
): string {
  const b = (body ?? {}) as { error?: string; code?: string };
  if (status === 401) return APPROVE_COPY.ERR_UNAUTHORIZED;
  if (b.error === "world_required") return APPROVE_COPY.ERR_WORLD_REQUIRED;
  if (b.error === "world_not_bound") return APPROVE_COPY.ERR_WORLD_NOT_BOUND;
  if (b.error === "not_found") return APPROVE_COPY.ERR_NOT_FOUND;
  if (b.error === "not_pending") return APPROVE_COPY.ERR_NOT_PENDING;
  if (b.error === "expired") return msg("EXPIRED", { amount: view.amount });
  if (b.error === "chain_error") {
    const code = b.code && SAFE_CODE.test(b.code) ? b.code : "unknown";
    return fill(action === "approve" ? APPROVE_COPY.ERR_RELEASE_CHAIN : APPROVE_COPY.ERR_REFUND_CHAIN, { code });
  }
  return fill(APPROVE_COPY.ERR_OTHER, { error: b.error ?? `HTTP ${status}` });
}

/** Only an https World authorize URL is followed; anything else is an error, not a redirect. */
export function safeVerifyUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export const statusLabel = (s: ApproveStatus): string =>
  ({
    pending: APPROVE_COPY.STATUS_PENDING,
    approved: APPROVE_COPY.STATUS_APPROVED,
    denied: APPROVE_COPY.STATUS_DENIED,
    expired: APPROVE_COPY.STATUS_EXPIRED,
  })[s];
