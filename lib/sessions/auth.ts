// Agent key → owner. The key is only ever compared as sha256 hex (`agent_keys.token_hash`).
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { agentKeys, owners } from "../db/schema";

export interface AgentKeyOwner {
  agentKeyId: string;
  ownerId: string;
  settleMode: string;
}

export const hashAgentKey = (token: string) => createHash("sha256").update(token).digest("hex");

export function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S{1,512})$/i.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

export async function ownerForAgentKey(token: string): Promise<AgentKeyOwner | null> {
  const [row] = await db()
    .select({ agentKeyId: agentKeys.id, ownerId: owners.id, settleMode: owners.settleMode })
    .from(agentKeys)
    .innerJoin(owners, eq(owners.id, agentKeys.ownerId))
    .where(and(eq(agentKeys.tokenHash, hashAgentKey(token)), isNull(agentKeys.revokedAt)))
    .limit(1);
  return row ?? null;
}
