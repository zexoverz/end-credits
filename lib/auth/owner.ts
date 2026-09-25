// Owner session: an iron-session cookie `ec_owner` holding `{ownerId}`, sealed with SESSION_SECRET.
// The dev-login route sets it; World sign-in (E11) will too. Until World is required, a request
// may instead carry `Authorization: Bearer <OWNER_DEV_TOKEN>` for demo scripting.
import { timingSafeEqual } from "node:crypto";
import { getIronSession, webCookies, type IronSession, type SessionOptions } from "iron-session";
import { readEnv } from "../env";

export const OWNER_COOKIE = "ec_owner";

export type OwnerSession = { ownerId?: string };

type Env = Record<string, string | undefined>;

export function ownerSessionOptions(env: Env = process.env): SessionOptions {
  return {
    password: readEnv("SESSION_SECRET", env),
    cookieName: OWNER_COOKIE,
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  };
}

/** The owner session from a route's Request, or from Next's cookies() when none is given. */
export async function getOwnerSession(req?: Request): Promise<IronSession<OwnerSession>> {
  const store = req ? webCookies(req, new Headers()) : await (await import("next/headers")).cookies();
  return getIronSession<OwnerSession>(store, ownerSessionOptions());
}

/** True when the request carries the dev owner token and World is not required. */
export function hasOwnerDevToken(req: Request, env: Env = process.env): boolean {
  if (env.WORLD_REQUIRED === "true") return false;
  const expected = env.OWNER_DEV_TOKEN;
  const got = /^Bearer\s+(\S{1,512})$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
