// Test-only helpers for the owner / approve / history integration tests (real Postgres).
import { createHash, randomUUID } from "node:crypto";
import { keccak256, stringToBytes, verifyTypedData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ReleaseCall } from "@/lib/approve/actions";
import type { ReleaseTypedData } from "@/lib/approve/typed-data";

export const TEST_DB = process.env.TEST_DATABASE_URL;
export const SECRET = "s".repeat(40);
export const DEV_TOKEN = `dev_${randomUUID()}`;
export const APP = "https://credits.test";

type Schema = typeof import("@/lib/db/schema");
type Db = ReturnType<typeof import("@/lib/db/client").db>;

export async function connect(): Promise<{ db: Db; s: Schema }> {
  process.env.DATABASE_URL = TEST_DB;
  process.env.SESSION_SECRET = SECRET;
  process.env.OWNER_DEV_TOKEN = DEV_TOKEN;
  process.env.APP_URL = APP;
  delete process.env.WORLD_REQUIRED;
  const { db } = await import("@/lib/db/client");
  return { db: db(), s: await import("@/lib/db/schema") };
}

/** The owner's approver wallet in tests: a local key that signs releases. */
export const APPROVER = privateKeyToAccount(`0x${"42".repeat(32)}`);
export const ESCROW: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/** An owner; with an approver wallet (APPROVER) unless `approver: null`. */
export async function makeOwner(db: Db, s: Schema, opts: { approver?: Address | null } = {}): Promise<string> {
  const approverAddress = opts.approver === undefined ? APPROVER.address : opts.approver;
  const [row] = await db
    .insert(s.owners)
    .values({ displayName: "t", payerAddress: "0x00000000000000000000000000000000000000aa", approverAddress })
    .returning({ id: s.owners.id });
  return row.id;
}

/** Signs the JSON typed data `prepare` returns, as the browser wallet would. */
export function signPrepared(
  typedData: { domain: ReleaseTypedData["domain"]; message: Record<string, string> },
  signer = APPROVER,
): Promise<Hex> {
  const m = typedData.message;
  return signer.signTypedData({
    domain: typedData.domain,
    types: {
      Release: [
        { name: "tipId", type: "bytes32" },
        { name: "payee", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "approvalRef", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Release",
    message: {
      tipId: m.tipId as Hex,
      payee: m.payee as Address,
      amount: BigInt(m.amount),
      approvalRef: m.approvalRef as Hex,
      deadline: BigInt(m.deadline),
    },
  });
}

/** The owner the dev token signs in as (the first row), created when the table is empty. */
export async function devOwner(db: Db, s: Schema): Promise<string> {
  const { firstOwnerId } = await import("@/lib/auth/owner");
  const existing = await firstOwnerId();
  if (existing) return existing;
  await makeOwner(db, s);
  return (await firstOwnerId())!;
}

export async function signInCookie(ownerId: string): Promise<string> {
  const { writeOwnerSession } = await import("@/lib/auth/owner");
  const headers = new Headers();
  await writeOwnerSession(new Request(`${APP}/`), headers, ownerId);
  return headers.get("set-cookie")!.split(";")[0];
}

export function req(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`${APP}${path}`, { ...init, headers });
}

export const PAYEE = "0x1234567890AbcdEF1234567890aBcdef12345678";
export const HELD_TEXT = "Held: the funding address changed 2 days ago. Waiting for the owner.";

export interface SeededHold {
  tipId: Hex;
  creditId: string;
  holdId: string;
  sessionId: string;
  packageName: string;
}

/** One held credit with a pending hold for `ownerId`. */
export async function seedHold(
  db: Db,
  s: Schema,
  ownerId: string,
  opts: { expiresAt?: Date; amountMicro?: bigint } = {},
): Promise<SeededHold> {
  const [key] = await db
    .insert(s.agentKeys)
    .values({
      ownerId,
      label: "k",
      tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
      boundVia: "dev",
    })
    .returning();
  const sessionId = randomUUID();
  await db.insert(s.sessions).values({
    id: sessionId,
    ownerId,
    agentKeyId: key.id,
    claudeSessionId: randomUUID(),
    sessionKey: keccak256(stringToBytes(sessionId)),
    status: "settled",
  });
  const packageName = `@endcredits-demo/moved-payout-${randomUUID().slice(0, 8)}`;
  const [pkg] = await db
    .insert(s.packages)
    .values({ name: packageName, packageKey: keccak256(stringToBytes(`npm:${packageName}`)) })
    .returning();
  const tipId = keccak256(stringToBytes(randomUUID()));
  const [credit] = await db
    .insert(s.credits)
    .values({
      sessionId,
      packageId: pkg.id,
      score: 5,
      amountMicro: opts.amountMicro ?? BigInt(150_000),
      role: "starring",
      payee: PAYEE,
      payeeSource: "npm_funding",
      outcome: "held",
      reasons: [{ source: "payee", code: "HELD_CHANGED", text: HELD_TEXT }],
      tipId,
      txHash: "0xhold",
      decidedAt: new Date(),
    })
    .returning();
  const [hold] = await db
    .insert(s.holds)
    .values({
      creditId: credit.id,
      tipId,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 3600_000),
      holdTx: "0xhold",
    })
    .returning();
  return { tipId, creditId: credit.id, holdId: hold.id, sessionId, packageName };
}

/** A chain double that records calls; signatures are checked as EOA signatures (no RPC). */
export function fakeChain() {
  const calls = { release: [] as ReleaseCall[], refund: [] as Hex[], verify: 0 };
  let n = 0;
  const tx = () => `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
  const chain = {
    calls,
    fail: null as Error | null,
    /** Simulated mining time, so concurrent callers overlap. */
    delayMs: 0,
    async release(a: ReleaseCall): Promise<Hex> {
      if (chain.fail) throw chain.fail;
      await new Promise((r) => setTimeout(r, chain.delayMs));
      calls.release.push(a);
      return tx();
    },
    async refund(tipId: Hex): Promise<Hex> {
      if (chain.fail) throw chain.fail;
      calls.refund.push(tipId);
      return tx();
    },
    releaseDomain: () => ({ escrow: ESCROW, chainId: 84532 }),
    async verifyRelease(approver: Address, typedData: ReleaseTypedData, signature: Hex): Promise<boolean> {
      calls.verify++;
      return verifyTypedData({ address: approver, ...typedData, signature }).catch(() => false);
    },
  };
  return chain;
}
