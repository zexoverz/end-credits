// Funding-file parsers (DESIGN §7.2, decisions.md "tea.yaml and FUNDING.json").
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { parse as parseYaml } from "yaml";

export type Parsed = { address: Address } | { address: null; reason?: "PAYEE_INVALID" };

const NONE: Parsed = { address: null };
const INVALID: Parsed = { address: null, reason: "PAYEE_INVALID" };
const ADDRESS_IN_TEXT = /0x[0-9a-fA-F]{40}/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// Strict isAddress rejects a mixed-case address whose checksum is wrong: a typo, not a payee.
export function checksum(raw: unknown): Parsed {
  if (typeof raw !== "string" || !isAddress(raw)) return INVALID;
  const address = getAddress(raw);
  return address === zeroAddress ? INVALID : { address };
}

export function parseFundingJson(text: string): Parsed {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return NONE;
  }
  const drips = isObj(doc) && isObj(doc.drips) ? doc.drips : null;
  if (!drips) return NONE;
  const networks = ["ethereum", ...Object.keys(drips).filter((k) => k !== "ethereum")];
  for (const net of networks) {
    const entry = drips[net];
    if (isObj(entry) && entry.ownedBy !== undefined) return checksum(entry.ownedBy);
  }
  return NONE;
}

export const X402_ENDPOINT_MAX = 2048;

/** Our FUNDING.json extension (decisions.md "Agent-to-agent x402"): a top-level
 *  `"x402": {"endpoint": "https://…"}`. https only, no credentials or fragment, at most 2048 chars;
 *  else null. The payee is still `drips.*.ownedBy`; the endpoint only says where to pay it. */
export function parseX402Endpoint(text: string): string | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  const raw = isObj(doc) && isObj(doc.x402) ? doc.x402.endpoint : undefined;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > X402_ENDPOINT_MAX) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
  const out = url.toString();
  return out.length > X402_ENDPOINT_MAX ? null : out;
}

export function parseTeaYaml(text: string): Parsed {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return NONE;
  }
  if (!isObj(doc) || Number(doc.quorum) !== 1) return NONE;
  const owners = doc.codeOwners;
  if (!Array.isArray(owners) || owners.length === 0) return NONE;
  return checksum(owners[0]);
}

export function parseNpmFunding(funding: unknown): Parsed {
  if (funding == null) return NONE;
  const match = JSON.stringify(funding).match(ADDRESS_IN_TEXT);
  return match ? checksum(match[0]) : NONE;
}
