// Owner sign-in with the owner's wallet (SIWE, EIP-4361). The nonce lives in the `ec_owner` cookie for
// 10 minutes and is spent in `siwe_nonces` on first use, so a replayed cookie cannot reuse it. The
// signer must be the owner's bound wallet; the first sign-in binds it (rule in decisions.md).
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getAddress, isHex, zeroAddress, type Address, type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { z } from "zod";
import { db } from "../db/client";
import { owners, siweNonces } from "../db/schema";
import { readEnv } from "../env";
import { ownerIronSession } from "./owner";

export const SIWE_CHAIN_ID = 84532;
const NONCE_TTL_MS = 10 * 60_000;
const MAX_AGE_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 60_000;

export interface WalletAuthDeps {
  /** EOA, ERC-1271 and ERC-6492 check of the SIWE signature. */
  verify(p: { address: Address; message: string; signature: Hex }): Promise<boolean>;
  /** The escrow approver in force for `payer` (zero address when none). */
  approverOf(payer: Address): Promise<Address>;
  now?(): Date;
}

export type WalletError = "bad_nonce" | "bad_domain" | "bad_signature" | "wrong_wallet" | "expired";

const STATUS: Record<WalletError, number> = {
  bad_nonce: 401,
  bad_domain: 401,
  bad_signature: 401,
  expired: 401,
  wrong_wallet: 403,
};

const noStore = { "cache-control": "no-store" };

const body = z.object({
  message: z.string().min(1).max(4096),
  signature: z.string().max(100_000).refine((s) => isHex(s, { strict: true })),
});

type Siwe = ReturnType<typeof parseSiweMessage>;
type Checked = { ok: true; address: Address } | { ok: false; error: WalletError };

/** POST /api/auth/wallet/nonce → { nonce }, kept in the cookie for 10 minutes. */
export async function handleWalletNonce(req: Request, now: Date = new Date()): Promise<Response> {
  const headers = new Headers(noStore);
  const session = await ownerIronSession(req, headers);
  const nonce = generateSiweNonce();
  session.siweNonce = nonce;
  session.siweNonceExp = now.getTime() + NONCE_TTL_MS;
  await session.save();
  return Response.json({ nonce }, { headers });
}

function appUrl(): URL {
  return new URL(readEnv("APP_URL"));
}

/** Domain, uri, chain and time checks on the parsed message; no signature or DB yet. */
function checkMessage(m: Siwe, now: Date): WalletError | null {
  const app = appUrl();
  let uriOrigin: string | null = null;
  try {
    uriOrigin = m.uri ? new URL(m.uri).origin : null;
  } catch {
    uriOrigin = null;
  }
  if (m.domain !== app.host || uriOrigin !== app.origin) return "bad_domain";
  if (m.chainId !== SIWE_CHAIN_ID) return "bad_domain";
  const t = now.getTime();
  if (!m.issuedAt || t - m.issuedAt.getTime() > MAX_AGE_MS) return "expired";
  if (m.issuedAt.getTime() > t + CLOCK_SKEW_MS) return "expired";
  if (m.expirationTime && m.expirationTime.getTime() <= t) return "expired";
  if (m.notBefore && m.notBefore.getTime() > t + CLOCK_SKEW_MS) return "expired";
  return null;
}

/** Marks the nonce spent; false when it already was. */
async function spendNonce(nonce: string): Promise<boolean> {
  const rows = await db()
    .insert(siweNonces)
    .values({ nonce })
    .onConflictDoNothing()
    .returning({ nonce: siweNonces.nonce });
  return rows.length === 1;
}

async function checkSigned(
  m: Siwe,
  message: string,
  signature: Hex,
  stored: { nonce?: string; exp?: number },
  deps: WalletAuthDeps,
  now: Date,
): Promise<Checked> {
  if (!m.address || !m.nonce) return { ok: false, error: "bad_signature" };
  const bad = checkMessage(m, now);
  if (bad) return { ok: false, error: bad };
  if (!stored.nonce || !stored.exp || stored.exp < now.getTime() || m.nonce !== stored.nonce) {
    return { ok: false, error: "bad_nonce" };
  }
  if (!(await spendNonce(m.nonce))) return { ok: false, error: "bad_nonce" };
  const address = getAddress(m.address);
  const valid = await deps.verify({ address, message, signature }).catch(() => false);
  return valid ? { ok: true, address } : { ok: false, error: "bad_signature" };
}

type Bound = { ownerId: string } | { error: WalletError } | { error: "no_owner" | "chain_error" };

/**
 * The owner this wallet signs in as. A bound wallet signs in as its owner. An unbound one binds to the
 * first owner only if that owner has no wallet yet and the address is its on-chain approver (or none
 * is set).
 */
async function ownerFor(address: Address, deps: WalletAuthDeps): Promise<Bound> {
  const lower = address.toLowerCase();
  const [bound] = await db()
    .select({ id: owners.id })
    .from(owners)
    .where(sql`lower(${owners.walletAddress}) = ${lower}`)
    .limit(1);
  if (bound) return { ownerId: bound.id };
  const [first] = await db().select().from(owners).orderBy(asc(owners.createdAt), asc(owners.id)).limit(1);
  if (!first) return { error: "no_owner" };
  let approver: Address;
  try {
    approver = await deps.approverOf(first.payerAddress as Address);
  } catch {
    return { error: "chain_error" };
  }
  if (approver !== zeroAddress && approver.toLowerCase() !== lower) return { error: "wrong_wallet" };
  // Binds only while the row has no wallet: an owner with one refuses every other wallet.
  const [updated] = await db()
    .update(owners)
    .set({ walletAddress: address })
    .where(and(eq(owners.id, first.id), isNull(owners.walletAddress)))
    .returning({ id: owners.id });
  return updated ? { ownerId: updated.id } : { error: "wrong_wallet" };
}

const STATUS_OTHER = { no_owner: 404, chain_error: 502 } as const;

/** POST /api/auth/wallet { message, signature } → { ownerId, wallet } and the owner cookie. */
export async function handleWalletLogin(req: Request, deps: WalletAuthDeps): Promise<Response> {
  const now = deps.now?.() ?? new Date();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { message } = parsed.data;
  const signature = parsed.data.signature as Hex;

  const headers = new Headers(noStore);
  const session = await ownerIronSession(req, headers);
  const stored = { nonce: session.siweNonce, exp: session.siweNonceExp };
  delete session.siweNonce;
  delete session.siweNonceExp;

  const fail = async (error: WalletError | keyof typeof STATUS_OTHER) => {
    await session.save();
    const status = error in STATUS ? STATUS[error as WalletError] : STATUS_OTHER[error as keyof typeof STATUS_OTHER];
    return Response.json({ error }, { status, headers });
  };

  const checked = await checkSigned(parseSiweMessage(message), message, signature, stored, deps, now);
  if (!checked.ok) return fail(checked.error);
  const owner = await ownerFor(checked.address, deps);
  if ("error" in owner) return fail(owner.error);
  session.ownerId = owner.ownerId;
  await session.save();
  return Response.json({ ownerId: owner.ownerId, wallet: checked.address }, { headers });
}
