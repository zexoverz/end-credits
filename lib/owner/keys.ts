// Agent keys (DESIGN §3 `agent_keys`). The plaintext token is returned once at creation; only its
// sha256 hex is stored, the same hash `POST /api/sessions` checks.
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { agentKeys } from "../db/schema";
import { hashAgentKey } from "../sessions/auth";

export const keyInput = z.strictObject({ label: z.string().trim().min(1).max(100) });

export interface KeyView {
  id: string;
  label: string;
  boundVia: string;
  createdAt: string;
  revokedAt: string | null;
}

const view = (k: typeof agentKeys.$inferSelect): KeyView => ({
  id: k.id,
  label: k.label,
  boundVia: k.boundVia,
  createdAt: k.createdAt.toISOString(),
  revokedAt: k.revokedAt?.toISOString() ?? null,
});

export const newAgentToken = () => `ec_${randomBytes(32).toString("base64url")}`;

export async function listKeys(ownerId: string): Promise<KeyView[]> {
  const rows = await db()
    .select()
    .from(agentKeys)
    .where(eq(agentKeys.ownerId, ownerId))
    .orderBy(desc(agentKeys.createdAt));
  return rows.map(view);
}

export async function createKey(ownerId: string, label: string): Promise<KeyView & { token: string }> {
  const token = newAgentToken();
  const [row] = await db()
    .insert(agentKeys)
    .values({ ownerId, label, tokenHash: hashAgentKey(token), boundVia: "dev" })
    .returning();
  return { ...view(row), token };
}

/** Revokes one of the owner's keys. Null when it is not theirs; already revoked keeps its time. */
export async function revokeKey(ownerId: string, id: string): Promise<KeyView | null> {
  const mine = and(eq(agentKeys.id, id), eq(agentKeys.ownerId, ownerId));
  const [updated] = await db()
    .update(agentKeys)
    .set({ revokedAt: new Date() })
    .where(and(mine, isNull(agentKeys.revokedAt)))
    .returning();
  if (updated) return view(updated);
  const [existing] = await db().select().from(agentKeys).where(mine).limit(1);
  return existing ? view(existing) : null;
}
