// Owner sign-in with World ID, code flow + PKCE (DESIGN §14.1).
//   GET /api/auth/world/start     → 302 to World's authorize endpoint, checks in the `ec_world` cookie
//   GET /api/auth/world/callback  → state, exchange, verifyIdToken, bind or match the owner → /owner
// Every failure redirects to /owner?world=<CODE> and signs nobody in.
import * as client from "openid-client";
import { writeOwnerSession } from "../auth/owner";
import { appPath, publicCallbackUrl, signInRedirectUri, worldConfig, type WorldDeps } from "./config";
import { exchangeCode } from "./exchange";
import { bindOrMatchOwner } from "./owner";
import { takeSignInChecks, writeSignInChecks } from "./session";
import { WorldTokenError } from "./verify";

export function redirect(location: string, headers: Headers = new Headers()): Response {
  headers.set("location", location);
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}

export interface AuthorizeParams {
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  extra?: Record<string, string>;
}

/** The authorize URL: scope openid only, response_type code, PKCE S256. */
export async function authorizeUrl(config: client.Configuration, p: AuthorizeParams): Promise<URL> {
  return client.buildAuthorizationUrl(config, {
    response_type: "code",
    redirect_uri: p.redirectUri,
    scope: "openid",
    state: p.state,
    nonce: p.nonce,
    code_challenge: await client.calculatePKCECodeChallenge(p.codeVerifier),
    code_challenge_method: "S256",
    ...p.extra,
  });
}

export async function handleSignInStart(req: Request, deps: WorldDeps = {}): Promise<Response> {
  const checks = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    codeVerifier: client.randomPKCECodeVerifier(),
  };
  const url = await authorizeUrl(worldConfig(deps), { redirectUri: signInRedirectUri(), ...checks });
  const headers = new Headers();
  await writeSignInChecks(req, headers, checks);
  return redirect(url.href, headers);
}

const fail = (code: string, headers: Headers) =>
  redirect(appPath(`/owner?world=${encodeURIComponent(code)}`), headers);

export async function handleSignInCallback(req: Request, deps: WorldDeps = {}): Promise<Response> {
  const headers = new Headers();
  const checks = await takeSignInChecks(req, headers);
  const params = new URL(req.url).searchParams;
  if (params.get("error")) return fail("CANCELLED", headers);
  if (!checks || params.get("state") !== checks.state) return fail("STATE", headers);

  let identity;
  try {
    identity = await exchangeCode(
      worldConfig(deps),
      publicCallbackUrl(req, signInRedirectUri()),
      checks,
      deps,
    );
  } catch (err) {
    if (err instanceof WorldTokenError) return fail(err.code, headers);
    throw err;
  }
  const bound = await bindOrMatchOwner(identity.iss, identity.sub);
  if ("error" in bound) return fail(bound.error, headers);
  await writeOwnerSession(req, headers, bound.ownerId);
  return redirect(appPath("/owner"), headers);
}
