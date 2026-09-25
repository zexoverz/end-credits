// Owner auth (DESIGN §14.1, pre-E11). An iron-session cookie `ec_owner` holds `{ownerId}`. Until World
// sign-in ships, the owner signs in with OWNER_DEV_TOKEN (cookie via /api/auth/dev, or a bearer for
// scripts). Both dev paths are off when WORLD_REQUIRED=true. The token is never logged.
import { createHash, timingSafeEqual } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getIronSession, webCookies, type SessionOptions } from "iron-session";
import { db } from "../db/client";
import { owners } from "../db/schema";
import { readEnv } from "../env";
import { bearerToken } from "../sessions/auth";

export const OWNER_COOKIE = "ec_owner";
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface OwnerSession {
  ownerId: string;
}

type SessionData = Partial<OwnerSession>;

export const worldRequired = () => process.env.WORLD_REQUIRED === "true";

function sessionOptions(): SessionOptions {
  return {
    password: readEnv("SESSION_SECRET"),
    cookieName: OWNER_COOKIE,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check against OWNER_DEV_TOKEN. False when unset or when World is required. */
export function devTokenMatches(token: string): boolean {
  const expected = process.env.OWNER_DEV_TOKEN;
  if (!expected || worldRequired()) return false;
  return timingSafeEqual(sha256(token), sha256(expected));
}

export async function firstOwnerId(): Promise<string | null> {
  const [row] = await db()
    .select({ id: owners.id })
    .from(owners)
    .orderBy(asc(owners.createdAt), asc(owners.id))
    .limit(1);
  return row?.id ?? null;
}

async function ironSession(req?: Request, out: Headers = new Headers()) {
  if (req) return getIronSession<SessionData>(webCookies(req, out), sessionOptions());
  const { cookies } = await import("next/headers");
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/** The signed-in owner from the cookie. Without `req`, reads Next's request cookies. */
export async function getOwnerSession(req?: Request): Promise<OwnerSession | null> {
  const session = await ironSession(req);
  return session.ownerId ? { ownerId: session.ownerId } : null;
}

/** Sets the session cookie on `out` (the response headers). */
export async function writeOwnerSession(req: Request, out: Headers, ownerId: string): Promise<void> {
  const session = await ironSession(req, out);
  session.ownerId = ownerId;
  await session.save();
}

export async function clearOwnerSession(req: Request, out: Headers): Promise<void> {
  (await ironSession(req, out)).destroy();
}

/** `Authorization: Bearer <OWNER_DEV_TOKEN>` → the first owner row. Off when World is required. */
export async function ownerFromBearer(req: Request): Promise<OwnerSession | null> {
  const token = bearerToken(req);
  if (!token || !devTokenMatches(token)) return null;
  const ownerId = await firstOwnerId();
  return ownerId ? { ownerId } : null;
}

async function ownerExists(ownerId: string): Promise<boolean> {
  const [row] = await db().select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId)).limit(1);
  return Boolean(row);
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

/** The owner behind this request (dev bearer, then cookie), or throws a 401 Response. */
export async function requireOwner(req?: Request): Promise<OwnerSession> {
  const owner = (req && (await ownerFromBearer(req))) || (await getOwnerSession(req));
  if (!owner || !(await ownerExists(owner.ownerId))) throw unauthorized();
  return owner;
}

/** Runs `fn` with the owner, turning a thrown Response (401) into the returned one. */
export async function withOwner(
  req: Request,
  fn: (owner: OwnerSession) => Promise<Response>,
): Promise<Response> {
  let owner: OwnerSession;
  try {
    owner = await requireOwner(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  return fn(owner);
}
