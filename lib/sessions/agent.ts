// Agent-key routes for the MCP server (decisions.md "MCP server"). The agent can ask for its own
// session to roll and read its owner's limits; who gets paid stays with the screened settler.
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { sessions } from "../db/schema";
import { ownerRow, settingsView } from "../owner/settings";
import { bearerToken, ownerForAgentKey, type AgentKeyOwner } from "./auth";

const error = (status: number, code: string) => Response.json({ error: code }, { status });

async function agentKey(req: Request): Promise<AgentKeyOwner | null> {
  const token = bearerToken(req);
  return token ? ownerForAgentKey(token) : null;
}

/** GET /api/agent/settings: the owner's budget, cap, daily limit and settle mode for this key. */
export async function handleAgentSettings(req: Request): Promise<Response> {
  const key = await agentKey(req);
  if (!key) return error(401, "unauthorized");
  const row = await ownerRow(key.ownerId);
  if (!row) return error(401, "unauthorized");
  return Response.json(settingsView(row), { headers: { "cache-control": "no-store" } });
}

/** POST /api/agent/sessions/:id/settle: same 202/409 as the owner's press, for the uploading key. */
export async function handleAgentSettle(req: Request, id: string): Promise<Response> {
  const key = await agentKey(req);
  if (!key) return error(401, "unauthorized");
  if (!z.uuid().safeParse(id).success) return error(404, "not_found");

  const [session] = await db()
    .select({ agentKeyId: sessions.agentKeyId })
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  if (!session) return error(404, "not_found");
  if (session.agentKeyId !== key.agentKeyId) return error(403, "forbidden");

  const updated = await db()
    .update(sessions)
    .set({ settleRequestedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.status, "uploaded"), isNull(sessions.settleRequestedAt)))
    .returning({ id: sessions.id });
  if (updated.length === 0) return error(409, "not_settleable");
  return Response.json({ id }, { status: 202 });
}
