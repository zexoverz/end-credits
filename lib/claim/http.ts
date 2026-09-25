// /api/claim/<name>/<action>. Next.js allows a catch-all only as the last segment, so the route is
// app/api/claim/[...slug] and the action is the last part: ["@scope", "pkg", "wallet"].
import { isValidPackageName } from "../attribution/specifier";
import { GitHubError } from "../github/api";
import type { ClaimDeps } from "./deps";
import { openPr } from "./pr";
import { maintSession } from "./session";
import { checkStatus } from "./status";
import { fail, type Reply } from "./view";
import { setWallet } from "./wallet";

export function parseSlug(slug: string[]): { name: string; action: string } | null {
  if (slug.length < 2) return null;
  let parts: string[];
  try {
    parts = slug.map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
  const name = parts.slice(0, -1).join("/");
  return isValidPackageName(name) ? { name, action: parts[parts.length - 1] } : null;
}

// POSTs from another site carry no ec_maint cookie (SameSite=Lax); this also refuses a stated
// foreign Origin outright.
function foreignOrigin(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin !== new URL(appUrl).origin;
}

async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function route(req: Request, name: string, action: string, id: string | undefined, deps: ClaimDeps): Promise<Reply> {
  const post = req.method === "POST";
  if (action === "status" && (post || req.method === "GET")) return checkStatus(name, id, deps);
  if (action === "wallet" && post) return setWallet(name, id, await jsonBody(req), deps);
  if (action === "pr" && post) return openPr(name, id, deps);
  return fail(404, "not_found");
}

export async function handleClaim(req: Request, slug: string[], deps: ClaimDeps): Promise<Response> {
  const parsed = parseSlug(slug);
  if (!parsed) return Response.json({ error: "invalid_package" }, { status: 400 });
  if (req.method === "POST" && foreignOrigin(req, deps.appUrl)) {
    return Response.json({ error: "bad_origin" }, { status: 403 });
  }
  const headers = new Headers();
  const session = await maintSession(req, headers, { secret: deps.secret, appUrl: deps.appUrl });
  let out: Reply;
  try {
    out = await route(req, parsed.name, parsed.action, session.maintainerId, deps);
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    out = fail(502, "github_error");
    console.error(`claim ${parsed.action} ${parsed.name}: ${e.message}`);
  }
  return Response.json(out.body, { status: out.status, headers });
}
