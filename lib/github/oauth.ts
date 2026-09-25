// GitHub OAuth App sign-in for maintainers (DESIGN §13, T10.1). Web flow with state and PKCE
// (S256), scope `public_repo`. The token is sealed (lib/crypto/seal) before it is stored and is
// never put in the cookie, a log line or a response.
import { createHash, randomBytes } from "node:crypto";
import { isValidPackageName } from "../attribution/specifier";
import { maintSession } from "../claim/session";
import { seal } from "../crypto/seal";
import { createGitHub } from "./api";

export const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const TOKEN_URL = "https://github.com/login/oauth/access_token";
export const SCOPE = "public_repo";

export type MaintainerUpsert = { githubId: number; githubLogin: string; tokenEnc: string };

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  secret: string;
  fetch?: typeof fetch;
  maintainers: { upsert(m: MaintainerUpsert): Promise<string> };
};

const b64url = (b: Buffer) => b.toString("base64url");
const origin = (appUrl: string) => appUrl.replace(/\/+$/, "");
const redirectUri = (appUrl: string) => `${origin(appUrl)}/api/github/callback`;
const bad = (code: string) => Response.json({ error: code }, { status: 400 });

function redirect(location: string, headers: Headers): Response {
  headers.set("location", location);
  return new Response(null, { status: 302, headers });
}

export async function login(req: Request, cfg: OAuthConfig): Promise<Response> {
  const pkg = new URL(req.url).searchParams.get("pkg") ?? "";
  if (!isValidPackageName(pkg)) return bad("invalid_package");

  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());

  const headers = new Headers();
  const session = await maintSession(req, headers, cfg);
  session.oauth = { state, verifier, pkg };
  await session.save();

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(cfg.appUrl),
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return redirect(url.toString(), headers);
}

async function exchangeCode(code: string, verifier: string, cfg: OAuthConfig): Promise<string | null> {
  const res = await (cfg.fetch ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri(cfg.appUrl),
      code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: unknown };
  return typeof body.access_token === "string" && body.access_token ? body.access_token : null;
}

export async function callback(req: Request, cfg: OAuthConfig): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const headers = new Headers();
  const session = await maintSession(req, headers, cfg);
  const pending = session.oauth;
  const state = params.get("state");
  if (!pending || !state || state !== pending.state) return bad("bad_state");

  session.oauth = undefined;
  const back = `${origin(cfg.appUrl)}/npm/${pending.pkg}`;
  const code = params.get("code");
  if (!code) {
    // The user pressed Cancel on GitHub (`error=access_denied`).
    await session.save();
    return redirect(`${back}?github=cancelled`, headers);
  }

  const token = await exchangeCode(code, pending.verifier, cfg);
  if (!token) return bad("code_rejected");
  const user = await createGitHub({ token, fetch: cfg.fetch }).user();
  session.maintainerId = await cfg.maintainers.upsert({
    githubId: user.id,
    githubLogin: user.login,
    tokenEnc: seal(token, cfg.secret),
  });
  await session.save();
  return redirect(back, headers);
}
