// `endcredits login` through World's device grant (DESIGN §14.4, P1).
//   POST /api/agent/device/start  → device_authorization; the device code is sealed in device_sessions
//   POST /api/agent/device/poll   → one token request per call; on success verifyIdToken (no nonce,
//                                   the device grant ignores it), (iss, sub) must be an owner, and a
//                                   new agent key bound_via 'device_grant' is returned once.
// The device code and tokens never leave the server and are never logged.
import { and, eq } from "drizzle-orm";
import * as client from "openid-client";
import { z } from "zod";
import { db } from "../db/client";
import { agentKeys, deviceSessions } from "../db/schema";
import { newAgentToken } from "../owner/keys";
import { hashAgentKey } from "../sessions/auth";
import { DEVICE_GRANT, worldConfig, type WorldDeps } from "./config";
import { mapClientError } from "./exchange";
import { ownerByWorldId } from "./owner";
import { sealSecret, unsealSecret } from "./session";
import { verifyIdToken, WorldTokenError, type VerifiedIdToken } from "./verify";

const DEFAULT_INTERVAL = 5;
const DEFAULT_LABEL = "endcredits login";
const SEAL_SLACK_SECONDS = 60;

const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

export async function handleDeviceStart(_req: Request, deps: WorldDeps = {}): Promise<Response> {
  let r: client.DeviceAuthorizationResponse;
  try {
    r = await client.initiateDeviceAuthorization(worldConfig(deps), { scope: "openid" });
  } catch {
    return json({ error: "world_unavailable" }, 502);
  }
  const now = deps.now?.() ?? new Date();
  const [row] = await db()
    .insert(deviceSessions)
    .values({
      deviceCodeEnc: await sealSecret(r.device_code, r.expires_in + SEAL_SLACK_SECONDS),
      userCode: r.user_code,
      verificationUri: r.verification_uri,
      expiresAt: new Date(now.getTime() + r.expires_in * 1000),
      status: "pending",
    })
    .returning({ id: deviceSessions.id });
  return json({
    id: row.id,
    user_code: r.user_code,
    verification_uri: r.verification_uri,
    verification_uri_complete: r.verification_uri_complete ?? null,
    interval: r.interval ?? DEFAULT_INTERVAL,
    expires_in: r.expires_in,
  });
}

const pollBody = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(100).optional(),
});

/** Terminal statuses answer the same on every later poll. */
const TERMINAL: Record<string, [string, number]> = {
  complete: ["complete", 200],
  denied: ["access_denied", 403],
  expired: ["expired_token", 410],
  failed: ["rejected", 403],
};

async function setStatus(id: string, status: string): Promise<void> {
  await db()
    .update(deviceSessions)
    .set({ status, deviceCodeEnc: null })
    .where(and(eq(deviceSessions.id, id), eq(deviceSessions.status, "pending")));
}

type Grant = { idToken: string } | { response: Response };

async function tokenRequest(id: string, deviceCode: string, deps: WorldDeps): Promise<Grant> {
  try {
    const tokens = await client.genericGrantRequest(worldConfig(deps), DEVICE_GRANT, {
      device_code: deviceCode,
    });
    if (!tokens.id_token) throw new WorldTokenError("TOKEN");
    return { idToken: tokens.id_token };
  } catch (err) {
    if (err instanceof client.ResponseBodyError) {
      if (err.error === "authorization_pending" || err.error === "slow_down") {
        return { response: json({ status: err.error }) };
      }
      if (err.error === "access_denied") {
        await setStatus(id, "denied");
        return { response: json({ status: "access_denied" }, 403) };
      }
      if (err.error === "expired_token") {
        await setStatus(id, "expired");
        return { response: json({ status: "expired_token" }, 410) };
      }
      return { response: json({ status: "error", error: "world_error" }, 502) };
    }
    const mapped = mapClientError(err);
    if (mapped.code === "TOKEN") return { response: json({ status: "error", error: "world_error" }, 502) };
    await setStatus(id, "failed");
    return { response: json({ status: "rejected", code: mapped.code }, 403) };
  }
}

async function issueKey(id: string, ownerId: string, label: string): Promise<string | null> {
  return db().transaction(async (tx) => {
    const [claimed] = await tx
      .update(deviceSessions)
      .set({ status: "complete", ownerId, deviceCodeEnc: null })
      .where(and(eq(deviceSessions.id, id), eq(deviceSessions.status, "pending")))
      .returning({ id: deviceSessions.id });
    if (!claimed) return null;
    const token = newAgentToken();
    await tx
      .insert(agentKeys)
      .values({ ownerId, label, tokenHash: hashAgentKey(token), boundVia: "device_grant" });
    return token;
  });
}

export async function handleDevicePoll(req: Request, deps: WorldDeps = {}): Promise<Response> {
  const parsed = pollBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "not_found" }, 404);
  const { id, label } = parsed.data;
  const [row] = await db().select().from(deviceSessions).where(eq(deviceSessions.id, id)).limit(1);
  if (!row) return json({ error: "not_found" }, 404);

  const terminal = TERMINAL[row.status];
  if (terminal) return json({ status: terminal[0] }, terminal[1]);
  const now = deps.now?.() ?? new Date();
  if (!row.expiresAt || row.expiresAt.getTime() <= now.getTime()) {
    await setStatus(id, "expired");
    return json({ status: "expired_token" }, 410);
  }
  const deviceCode = row.deviceCodeEnc
    ? await unsealSecret(row.deviceCodeEnc, 24 * 3600).catch(() => null)
    : null;
  if (!deviceCode) {
    await setStatus(id, "expired");
    return json({ status: "expired_token" }, 410);
  }

  const grant = await tokenRequest(id, deviceCode, deps);
  if ("response" in grant) return grant.response;

  let identity: VerifiedIdToken;
  try {
    identity = await verifyIdToken(grant.idToken, { jwks: deps.jwks, now });
  } catch (err) {
    if (!(err instanceof WorldTokenError)) throw err;
    await setStatus(id, "failed");
    return json({ status: "rejected", code: err.code }, 403);
  }
  const ownerId = await ownerByWorldId(identity.iss, identity.sub);
  if (!ownerId) {
    await setStatus(id, "failed");
    return json({ status: "no_owner" }, 403);
  }
  const token = await issueKey(id, ownerId, label ?? DEFAULT_LABEL);
  if (!token) return json({ status: "complete" });
  return json({ status: "complete", token });
}
