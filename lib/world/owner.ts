// The owner behind a World ID (DESIGN §14.1). The first sign-in binds (iss, sub) to the seeded owner
// row, and only while that row is unbound; afterwards the pair must match an owner exactly.
import { and, eq, isNull } from "drizzle-orm";
import { keccak256, stringToBytes, type Hex } from "viem";
import { firstOwnerId } from "../auth/owner";
import { db } from "../db/client";
import { owners } from "../db/schema";

/** keccak256(iss || sub), the owner hash used in the approval payload. */
export const subHash = (iss: string, sub: string): Hex => keccak256(stringToBytes(iss + sub));

export async function ownerByWorldId(iss: string, sub: string): Promise<string | null> {
  const [row] = await db()
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.iss, iss), eq(owners.sub, sub)))
    .limit(1);
  return row?.id ?? null;
}

export type BindResult = { ownerId: string; bound: boolean } | { error: "WRONG_HUMAN" | "NO_OWNER" };

export async function bindOrMatchOwner(iss: string, sub: string): Promise<BindResult> {
  const existing = await ownerByWorldId(iss, sub);
  if (existing) return { ownerId: existing, bound: false };
  const seeded = await firstOwnerId();
  if (!seeded) return { error: "NO_OWNER" };
  // Conditional on `iss is null`, so two first sign-ins racing bind one human only.
  const [row] = await db()
    .update(owners)
    .set({ iss, sub, subHash: subHash(iss, sub) })
    .where(and(eq(owners.id, seeded), isNull(owners.iss)))
    .returning({ id: owners.id });
  return row ? { ownerId: row.id, bound: true } : { error: "WRONG_HUMAN" };
}

export interface OwnerWorldId {
  iss: string | null;
  sub: string | null;
  subHash: string | null;
}

export async function ownerWorldId(ownerId: string): Promise<OwnerWorldId | null> {
  const [row] = await db()
    .select({ iss: owners.iss, sub: owners.sub, subHash: owners.subHash })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);
  return row ?? null;
}
