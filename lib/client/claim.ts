// Client logic for /npm/[name]: the name from the catch-all, the API paths, and the four-step state
// machine derived from GET /api/npm/<name> and the latest ClaimView. Pure, so it is unit tested.
import { getAddress, isAddress } from "viem";
import type { PackageSummary } from "../claim/summary";
import type { ClaimView } from "../claim/view";
import type { MessageCode } from "../messages";
import { claimCopy, type ClaimCopyCode } from "../copy/claim";

export type { PackageSummary, ClaimView };

// The route already validates; this only rebuilds the name and rejects shapes npm cannot have.
export function packageNameFrom(segments: string[] | undefined): string | null {
  if (!segments?.length) return null;
  let parts: string[];
  try {
    parts = segments.map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  if (parts.some((p) => !p || p.includes("/"))) return null;
  const scoped = parts[0].startsWith("@");
  if (parts.length !== (scoped ? 2 : 1)) return null;
  return parts.join("/");
}

// Scoped names stay unencoded in the path (decisions.md E10); each segment is still escaped.
const pathOf = (name: string) => name.split("/").map(encodeURIComponent).join("/");

export const summaryPath = (name: string) => `/api/npm/${pathOf(name)}`;
export const claimPath = (name: string, action: "wallet" | "pr" | "status") =>
  `/api/claim/${pathOf(name)}/${action}`;
export const loginUrl = (name: string) => `/api/github/login?pkg=${encodeURIComponent(name)}`;

export type StepState = "done" | "active" | "locked" | "failed";
export type Steps = { github: StepState; wallet: StepState; pr: StepState; merge: StepState };

const AFTER_PR = new Set(["pr_open", "merged", "verified", "claimed", "refused"]);

// Whether this visitor can run the claim at all; the reason when not.
export function blocker(s: PackageSummary, claim: ClaimView | null): ClaimCopyCode | "ALREADY_PAYABLE" | null {
  if (claim && claim.status !== "none") return null; // their own claim always shows
  if (s.payeeRefused) return "PAYEE_REFUSED";
  if (!s.repo) return "NO_REPO";
  if (s.alreadyPayable) return "ALREADY_PAYABLE";
  if (s.state === "claimed") return "CLAIMED_BY_OTHER";
  return null;
}

export function steps(s: PackageSummary, claim: ClaimView | null): Steps {
  if (blocker(s, claim)) return { github: "locked", wallet: "locked", pr: "locked", merge: "locked" };
  const status = claim?.status ?? "none";
  const github: StepState = s.maintainer ? "done" : "active";
  const walletDone = !!claim?.wallet && status !== "none" && status !== "started";
  const wallet: StepState = !s.maintainer ? "locked" : walletDone ? "done" : "active";
  const prDone = AFTER_PR.has(status);
  const pr: StepState = wallet !== "done" ? "locked" : prDone ? "done" : "active";
  const merge: StepState =
    pr !== "done" ? "locked" : status === "claimed" ? "done" : status === "refused" ? "failed" : "active";
  return { github, wallet, pr, merge };
}

// The status endpoint moves the claim forward; poll while it can still move.
export function shouldPoll(claim: ClaimView | null): boolean {
  return !!claim && ["pr_open", "merged", "verified"].includes(claim.status);
}

export type Tone = "ok" | "error" | "info";

const ERROR_CODES = new Set<MessageCode>(["NO_PERMISSION", "ALREADY_PAYABLE", "FUNDING_MISMATCH", "CLAIM_REFUSED"]);

export function toneOf(code: MessageCode | null | undefined): Tone {
  if (code === "CLAIMED") return "ok";
  return code && ERROR_CODES.has(code) ? "error" : "info";
}

const ERROR_COPY: Record<string, ClaimCopyCode> = {
  signed_out: "ERR_SIGNED_OUT",
  invalid_address: "ERR_INVALID_ADDRESS",
  no_wallet: "ERR_NO_WALLET",
  github_error: "ERR_GITHUB",
  bad_origin: "ERR_BAD_ORIGIN",
  unknown_package: "ERR_UNKNOWN_PACKAGE",
  no_repo: "ERR_NO_REPO",
};

export type Notice = { tone: Tone; text: string; code: string | null };

// A failed claim call: the server's message when it sent one (NO_PERMISSION, ALREADY_PAYABLE),
// else the page copy for the error code.
export function errorNotice(body: unknown, status: number): Notice {
  const b = (body ?? {}) as { error?: unknown; code?: unknown; message?: unknown };
  const code = typeof b.code === "string" ? b.code : null;
  if (typeof b.message === "string" && b.message) return { tone: "error", text: b.message, code };
  const err = typeof b.error === "string" ? b.error : `HTTP ${status}`;
  const copy = ERROR_COPY[err];
  return { tone: "error", text: copy ? claimCopy(copy) : claimCopy("ERR_GENERIC", { error: err }), code: code ?? err };
}

export function viewNotice(v: ClaimView): Notice | null {
  return v.message ? { tone: toneOf(v.code), text: v.message, code: v.code } : null;
}

// What the header says about the reserve. A failed chain read is an error, never "nothing".
export function reserveLine(s: PackageSummary): Notice {
  if (s.errors.includes("chain")) return { tone: "error", text: claimCopy("CHAIN_ERROR"), code: "chain" };
  if (s.headline) return { tone: "info", text: s.headline, code: "CLAIM_HEADLINE" };
  return { tone: "info", text: claimCopy("NOTHING_RESERVED", { package: s.package }), code: null };
}

// eth_requestAccounts answers string[]; take the first valid address, checksummed.
export function firstAccount(result: unknown): string | null {
  if (!Array.isArray(result)) return null;
  const a = result.find((x): x is string => typeof x === "string" && isAddress(x, { strict: false }));
  return a ? getAddress(a) : null;
}

export function parseAddress(input: string): string | null {
  const t = input.trim();
  return isAddress(t, { strict: false }) ? getAddress(t) : null;
}

// EIP-1193 errors carry a numeric code; 4001 is the user closing the prompt.
export function walletErrorText(e: unknown): string {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (err?.code === 4001) return claimCopy("WALLET_REJECTED");
  const m = typeof err?.message === "string" && err.message ? err.message : String(e);
  return claimCopy("WALLET_FAILED", { error: m });
}

export const githubRepoUrl = (repo: string) => `https://github.com/${repo}`;

// Funding links come from package.json; only http(s) may become an href.
export function safeLinks(urls: string[]): string[] {
  return urls.filter((u) => {
    try {
      return ["http:", "https:"].includes(new URL(u).protocol);
    } catch {
      return false;
    }
  });
}
