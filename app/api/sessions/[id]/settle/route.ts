// POST /api/sessions/:id/settle: the owner's **Roll credits** press in on_open mode (DESIGN §6.3).
// Sets settle_requested_at once; the settler picks the session up. Any other state → 409.
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { devTokenMatches, getOwnerSession } from "@/lib/auth/owner";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const error = (status: number, code: string) => Response.json({ error: code }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return error(404, "not_found");

  const [session] = await db()
    .select({ ownerId: sessions.ownerId })
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  if (!session) return error(404, "not_found");

  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const ownerId = bearer && devTokenMatches(bearer) ? session.ownerId : (await getOwnerSession(req))?.ownerId;
  if (!ownerId) return error(401, "unauthorized");
  if (ownerId !== session.ownerId) return error(403, "forbidden");

  const updated = await db()
    .update(sessions)
    .set({ settleRequestedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.status, "uploaded"), isNull(sessions.settleRequestedAt)))
    .returning({ id: sessions.id });
  if (updated.length === 0) return error(409, "not_settleable");
  return Response.json({ id }, { status: 202 });
}
