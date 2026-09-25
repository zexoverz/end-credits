// `ec_world`: the sign-in's state, nonce and PKCE verifier, sealed in an iron-session cookie for
// 10 minutes (DESIGN §14.1). Also the seal for secrets kept in the DB (approval verifier, device code).
import { getIronSession, sealData, unsealData, webCookies, type SessionOptions } from "iron-session";
import { readEnv } from "../env";

export const WORLD_COOKIE = "ec_world";
export const WORLD_COOKIE_TTL_SECONDS = 600;

export interface SignInChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

type Data = Partial<SignInChecks>;

function options(): SessionOptions {
  return {
    password: readEnv("SESSION_SECRET"),
    cookieName: WORLD_COOKIE,
    ttl: WORLD_COOKIE_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      // lax: the callback is a top-level GET redirect from World, which still carries the cookie.
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/world",
    },
  };
}

export async function writeSignInChecks(req: Request, out: Headers, checks: SignInChecks): Promise<void> {
  const session = await getIronSession<Data>(webCookies(req, out), options());
  Object.assign(session, checks);
  await session.save();
}

/** Reads the checks and clears the cookie in the same step: they are single use. */
export async function takeSignInChecks(req: Request, out: Headers): Promise<SignInChecks | null> {
  const session = await getIronSession<Data>(webCookies(req, out), options());
  const { state, nonce, codeVerifier } = session;
  session.destroy();
  return state && nonce && codeVerifier ? { state, nonce, codeVerifier } : null;
}

/** Sealed with SESSION_SECRET (iron-session's seal), for a value that must sit in the DB. */
export const sealSecret = (value: string, ttlSeconds: number) =>
  sealData({ v: value }, { password: readEnv("SESSION_SECRET"), ttl: ttlSeconds });

export async function unsealSecret(sealed: string, ttlSeconds: number): Promise<string | null> {
  const data = await unsealData<{ v?: string }>(sealed, {
    password: readEnv("SESSION_SECRET"),
    ttl: ttlSeconds,
  });
  return typeof data.v === "string" ? data.v : null;
}
