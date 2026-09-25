// GET /api/github/callback: GitHub returns here after authorization (T10.1).
import { oauthFromEnv } from "@/lib/github/env";
import { callback } from "@/lib/github/oauth";

export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return callback(req, oauthFromEnv());
}
