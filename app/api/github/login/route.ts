// GET /api/github/login?pkg=<name>: start maintainer sign-in (DESIGN §13, T10.1).
import { oauthFromEnv } from "@/lib/github/env";
import { login } from "@/lib/github/oauth";

export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return login(req, oauthFromEnv());
}
