// The approval nonce binds one World ID verification to one tip (SPEC §9.2 step 4):
// nonce = base64url(sha256(canonical_json(payload) || APPROVE_SALT)).
import { createHash } from "node:crypto";
import { readEnv } from "../env";

export const APPROVE_TEXT_VERSION = "v1";

export interface ApprovalPayload {
  tipId: string;
  packageKey: string;
  payee: string;
  amount: string; // micro-USDC, decimal string
  action: "release";
  text_version: string;
  owner_sub_hash: string;
  /** The approval row id, so every attempt has its own nonce (the column is unique). */
  attempt: string;
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** JSON with object keys sorted at every level and no whitespace. */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function approvalNonce(payload: ApprovalPayload, salt: string = readEnv("APPROVE_SALT")): string {
  return createHash("sha256")
    .update(canonicalJson(payload as unknown as Json))
    .update(salt)
    .digest("base64url");
}
