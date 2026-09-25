// Reading and extending `credits.reasons` ([{source, code, text}], DESIGN §3).
import type { MessageCode } from "../messages";

export interface StoredReason {
  source: string;
  code: string;
  text: string;
}

const HOLD_CODES = new Set<string>(["HELD_CHANGED", "HELD_MEDIUM", "HELD_NO_CODE", "SCREEN_UNAVAILABLE"]);

function isReason(r: unknown): r is StoredReason {
  return typeof r === "object" && r !== null && typeof (r as StoredReason).text === "string";
}

export function reasonList(raw: unknown): StoredReason[] {
  return Array.isArray(raw) ? raw.filter(isReason) : [];
}

/** The text of the reason the credit was held for, else the first reason. */
export function holdReasonText(raw: unknown): string | null {
  const list = reasonList(raw);
  return (list.find((r) => HOLD_CODES.has(r.code)) ?? list[0])?.text ?? null;
}

/** An owner decision appended after the reasons already recorded. */
export function appendOwnerReason(raw: unknown, code: MessageCode, text: string): unknown[] {
  return [...(Array.isArray(raw) ? raw : []), { source: "owner", code, text }];
}
