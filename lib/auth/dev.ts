// POST /api/auth/dev and /api/auth/logout. Dev login binds the cookie to the first owner row and is
// refused outright when WORLD_REQUIRED=true.
import { z } from "zod";
import {
  clearOwnerSession,
  devTokenMatches,
  firstOwnerId,
  unauthorized,
  worldRequired,
  writeOwnerSession,
} from "./owner";

const body = z.object({ token: z.string().min(1).max(512) });

export async function handleDevLogin(req: Request): Promise<Response> {
  if (worldRequired()) return Response.json({ error: "world_required" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !devTokenMatches(parsed.data.token)) return unauthorized();
  const ownerId = await firstOwnerId();
  if (!ownerId) return Response.json({ error: "no_owner" }, { status: 404 });
  const headers = new Headers();
  await writeOwnerSession(req, headers, ownerId);
  return Response.json({ ownerId }, { headers });
}

export async function handleLogout(req: Request): Promise<Response> {
  const headers = new Headers();
  await clearOwnerSession(req, headers);
  return Response.json({ ok: true }, { headers });
}
