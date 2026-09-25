// The JSON shape every claim endpoint answers with, so the page renders one type.
import { formatUnits } from "viem";
import { msg, type MessageCode } from "../messages";
import type { ClaimRow } from "./store";

export type ClaimStatus = ClaimRow["status"] | "none";

export type ClaimView = {
  status: ClaimStatus;
  repo: string;
  wallet: string | null;
  prMode: "api" | "new_file_link" | null;
  prNumber: number | null;
  prUrl: string | null; // the PR, or the prefilled new-file link
  claimedAmount: string | null; // USDC, e.g. "0.75"
  coolingUntil: string | null; // ISO time
  code: MessageCode | null;
  message: string | null;
};

export type Note = { code: MessageCode; vars?: Record<string, string | number>; coolingUntil?: string };

export function claimView(repo: string, row: ClaimRow | null, note?: Note): ClaimView {
  return {
    status: row?.status ?? "none",
    repo,
    wallet: row?.walletAddress ?? null,
    prMode: (row?.prMode as ClaimView["prMode"]) ?? null,
    prNumber: row?.prNumber ?? null,
    prUrl: row?.prUrl ?? null,
    claimedAmount: row?.claimedMicro != null ? formatUnits(row.claimedMicro, 6) : null,
    coolingUntil: note?.coolingUntil ?? null,
    code: note?.code ?? null,
    message: note ? msg(note.code, note.vars) : null,
  };
}

export type Reply = { status: number; body: unknown };

export const reply = (body: unknown, status = 200): Reply => ({ status, body });

export const fail = (status: number, error: string, note?: Note): Reply =>
  reply({ error, ...(note ? { code: note.code, message: msg(note.code, note.vars) } : {}) }, status);
