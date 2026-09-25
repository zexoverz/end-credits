export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? "local" });
}
