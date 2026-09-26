// Owner sign-in with the owner's wallet (SIWE, EIP-4361). The nonce lives in the `ec_owner` cookie for
// 10 minutes and is spent in `siwe_nonces` on first use, so a replayed cookie cannot reuse it. The
// signer must be the owner's bound wallet; the first sign-in binds it, and a wallet no owner has
// becomes a new owner (rules in decisions.md).
import { randomUUID } from "node:crypto";
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
  /** The payer address a new owner with this id gets (derived from the master key). */
  newPayer(ownerId: string): Address;
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
 * is set). Any other wallet becomes a new owner with its own payer key (multi-owner, decisions.md).
 */
async function ownerFor(address: Address, deps: WalletAuthDeps): Promise<Bound> {
  const bound = await boundOwner(address);
  if (bound) return { ownerId: bound };
  const [first] = await db().select().from(owners).orderBy(asc(owners.createdAt), asc(owners.id)).limit(1);
  if (!first) return { error: "no_owner" };
  if (!first.walletAddress) {
    let approver: Address;
    try {
      approver = await deps.approverOf(first.payerAddress as Address);
    } catch {
      return { error: "chain_error" };
    }
    if (approver === zeroAddress || approver.toLowerCase() === address.toLowerCase()) {
      // Binds only while the row has no wallet; a lost race falls through to a new owner.
      const [updated] = await db()
        .update(owners)
        .set({ walletAddress: address })
        .where(and(eq(owners.id, first.id), isNull(owners.walletAddress)))
        .returning({ id: owners.id });
      if (updated) return { ownerId: updated.id };
    }
  }
  return newOwner(address, deps);
}

async function boundOwner(address: Address): Promise<string | null> {
  const [bound] = await db()
    .select({ id: owners.id })
    .from(owners)
    .where(sql`lower(${owners.walletAddress}) = ${address.toLowerCase()}`)
    .limit(1);
  return bound?.id ?? null;
}

/** A new owner for `address`: default limits, its own derived payer, the wallet bound. */
async function newOwner(address: Address, deps: WalletAuthDeps): Promise<Bound> {
  const id = randomUUID();
  const inserted = await db()
    .insert(owners)
    .values({
      id,
      displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
      payerAddress: deps.newPayer(id),
      walletAddress: address,
    })
    .onConflictDoNothing({ target: owners.walletAddress })
    .returning({ id: owners.id });
  if (inserted[0]) return { ownerId: inserted[0].id };
  // The same wallet signed in twice at once: the other request created it.
  const bound = await boundOwner(address);
  return bound ? { ownerId: bound } : { error: "wrong_wallet" };
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
