// Session manifest (DESIGN §7): canonical JSON (sorted keys, credits by package name) of what was
// decided and sent, hashed with keccak256 for `recordSession`.
import { keccak256, stringToBytes, type Hex } from "viem";

export type ManifestCredit = {
  package: string;
  amount: bigint;
  outcome: string | null;
  payee: string | null;
  tx: string | null;
};

export function canonicalJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function manifestOf(credits: ManifestCredit[]): { json: string; hash: Hex } {
  const sorted = [...credits].sort((a, b) => (a.package < b.package ? -1 : a.package > b.package ? 1 : 0));
  const json = canonicalJson(sorted);
  return { json, hash: keccak256(stringToBytes(json)) };
}
