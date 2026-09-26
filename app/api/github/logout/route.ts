// POST /api/github/logout: forget the maintainer's sign-in on this browser (the `ec_maint` cookie).
// The stored claim and its wallet stay; signing in again picks the claim up.
import { maintSession } from "@/lib/claim/session";
import { readEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const headers = new Headers({ "cache-control": "no-store" });
  const session = await maintSession(req, headers, { secret: readEnv("SESSION_SECRET"), appUrl: readEnv("APP_URL") });
  session.destroy();
  return new Response(null, { status: 204, headers });
}
