// Reading saved-query rows and turning their loosely typed values into exact ones. Anything that
// does not parse throws a MultiBaasError("parse"): the dashboard shows the error instead of a
// number it cannot vouch for.
import { MultiBaasError, type MultiBaasClient } from "./client";

export type Row = Record<string, unknown>;

/** MultiBaas rejects `limit` above 50 with 400 "invalid request" (checked live, 26 Sep). */
export const PAGE_SIZE = 50;
export const MAX_PAGES = 40;

const bad = (what: string, v: unknown) =>
  new MultiBaasError(`MultiBaas returned an unexpected ${what}: ${JSON.stringify(v)}`, "parse");

export async function queryRows(
  mb: MultiBaasClient,
  label: string,
  opts: { limit?: number; all?: boolean } = {},
): Promise<Row[]> {
  const limit = opts.limit ?? PAGE_SIZE;
  const out: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await mb.get<{ rows?: unknown }>(
      `/queries/${encodeURIComponent(label)}/results?offset=${page * limit}&limit=${limit}`,
    );
    const rows = result?.rows;
    if (!Array.isArray(rows)) throw bad(`result for ${label}`, result);
    out.push(...(rows as Row[]));
    if (opts.all === false || rows.length < limit) return out;
  }
  throw new MultiBaasError(`MultiBaas ${label}: more than ${MAX_PAGES * limit} rows`, "parse");
}

export function field(row: Row, name: string): unknown {
  if (!(name in row)) throw bad(`row without "${name}"`, row);
  return row[name];
}

/** Base-unit integer. Accepts "123", 123, and "123.000" (a numeric column rendered with scale). */
export function toMicro(v: unknown): bigint {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string") {
    const m = /^(\d+)(?:\.0+)?$/.exec(v.trim());
    if (m) return BigInt(m[1]);
  }
  throw bad("amount", v);
}

export function toBytes32(v: unknown): string {
  if (typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  throw bad("bytes32", v);
}

export function toAddress(v: unknown): string {
  if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return v.toLowerCase();
  throw bad("address", v);
}

export function toBool(v: unknown): boolean {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  throw bad("bool", v);
}

export function toBlock(v: unknown): number {
  if (typeof v === "number" && Number.isSafeInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  throw bad("block number", v);
}

/** `Held(bytes32,...)` → `Held`; a bare name passes through. */
export function eventName(v: unknown): string {
  if (typeof v === "string" && /^[A-Za-z_]\w*/.test(v)) return v.split("(")[0];
  throw bad("event signature", v);
}

export function optionalString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
