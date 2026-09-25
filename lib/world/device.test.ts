// CLI login via the device grant (T11.5): real Postgres, World's device and token endpoints faked by
// an injected fetch. Skipped without TEST_DATABASE_URL. Denied or expired device codes give no key.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, makeOwner, req, TEST_DB } from "../__fixtures__/owner-db";
import { CLIENT_ID, fakeTokenEndpoint, goodClaims, ISSUER, startIdp, worldEnv, type Idp } from "./__fixtures__/idp";

type Conn = Awaited<ReturnType<typeof connect>>;

describe.skipIf(!TEST_DB)("world device grant (integration)", () => {
  let idp: Idp;
  let db: Conn["db"];
  let s: Conn["s"];
  let d: typeof import("./device");
  let ownerId: string;
  let ownerSub: string;

  beforeAll(async () => {
    ({ db, s } = await connect());
    worldEnv();
    idp = await startIdp();
    d = await import("./device");
    ownerId = await makeOwner(db, s);
    ownerSub = `device-human-${randomUUID()}`;
    await db.update(s.owners).set({ iss: ISSUER, sub: ownerSub }).where(eq(s.owners.id, ownerId));
  });
  afterAll(() => idp.close());

  /** A fake World: device_authorization answers a fresh code, the token endpoint answers `token`. */
  function world(token: (deviceCode: string) => Promise<{ status?: number; json: unknown }>) {
    const deviceCode = `dc-${randomUUID()}`;
    return {
      deviceCode,
      ...fakeTokenEndpoint(async (body, url) => {
        if (url.endsWith("/api/v1/device_authorization")) {
          return {
            json: {
              device_code: deviceCode,
              user_code: "WDJB-MJHT",
              verification_uri: "https://world.org/device",
              verification_uri_complete: "https://world.org/device?code=WDJB-MJHT",
              expires_in: 600,
              interval: 5,
            },
          };
        }
        return token(body.get("device_code")!);
      }),
    };
  }

  const start = async (w: ReturnType<typeof world>) => {
    const res = await d.handleDeviceStart(req("/api/agent/device/start", { method: "POST" }), {
      fetch: w.fetch,
      jwks: idp.jwks,
    });
    return { res, body: await res.json() };
  };
  const poll = async (w: ReturnType<typeof world>, id: string) => {
    const res = await d.handleDevicePoll(
      req("/api/agent/device/poll", { method: "POST", body: JSON.stringify({ id, label: "laptop" }) }),
      { fetch: w.fetch, jwks: idp.jwks },
    );
    return { res, body: await res.json() };
  };
  const keysOf = (owner: string) => db.select().from(s.agentKeys).where(eq(s.agentKeys.ownerId, owner));

  it("start returns the user code and stores the device code sealed", async () => {
    const w = world(async () => ({ status: 400, json: { error: "authorization_pending" } }));
    const { res, body } = await start(w);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      user_code: "WDJB-MJHT",
      verification_uri: "https://world.org/device",
      verification_uri_complete: "https://world.org/device?code=WDJB-MJHT",
      interval: 5,
      expires_in: 600,
    });
    expect(body).not.toHaveProperty("device_code");
    expect(w.calls[0].body.get("scope")).toBe("openid");
    expect(w.calls[0].authorization).toMatch(/^Basic /);
    const [row] = await db.select().from(s.deviceSessions).where(eq(s.deviceSessions.id, body.id));
    expect(row.status).toBe("pending");
    expect(row.deviceCodeEnc).toBeTruthy();
    expect(row.deviceCodeEnc).not.toContain(w.deviceCode);
  });

  it("pending and slow_down pass through", async () => {
    let answer = "authorization_pending";
    const w = world(async () => ({ status: 400, json: { error: answer } }));
    const { body } = await start(w);
    expect((await poll(w, body.id)).body).toEqual({ status: "authorization_pending" });
    answer = "slow_down";
    expect((await poll(w, body.id)).body).toEqual({ status: "slow_down" });
    const call = w.calls.at(-1)!;
    expect(call.body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(call.body.get("device_code")).toBe(w.deviceCode);
  });

  it("approved: a new device_grant key for the matching owner, returned once", async () => {
    const w = world(async () => ({
      json: { access_token: "at", token_type: "Bearer", id_token: await idp.sign(goodClaims({ sub: ownerSub })) },
    }));
    const { body } = await start(w);
    const before = (await keysOf(ownerId)).length;
    const { res, body: done } = await poll(w, body.id);
    expect(res.status).toBe(200);
    expect(done.status).toBe("complete");
    expect(done.token).toMatch(/^ec_[\w-]{43}$/);
    const keys = await keysOf(ownerId);
    expect(keys).toHaveLength(before + 1);
    const { hashAgentKey } = await import("../sessions/auth");
    const key = keys.find((k) => k.tokenHash === hashAgentKey(done.token))!;
    expect(key).toMatchObject({ boundVia: "device_grant", label: "laptop" });

    const again = await poll(w, body.id);
    expect(again.body).toEqual({ status: "complete" });
    expect(await keysOf(ownerId)).toHaveLength(before + 1);
    const [row] = await db.select().from(s.deviceSessions).where(eq(s.deviceSessions.id, body.id));
    expect(row).toMatchObject({ status: "complete", ownerId, deviceCodeEnc: null });
  });

  it("two polls racing on one approved code issue one key", async () => {
    const w = world(async () => {
      // Both polls are past the status check before either gets its token.
      await new Promise((r) => setTimeout(r, 100));
      return {
        json: { access_token: "at", token_type: "Bearer", id_token: await idp.sign(goodClaims({ sub: ownerSub })) },
      };
    });
    const { body } = await start(w);
    const before = (await keysOf(ownerId)).length;
    const results = await Promise.all([poll(w, body.id), poll(w, body.id)]);
    expect(results.filter((r) => r.body.token)).toHaveLength(1);
    expect(await keysOf(ownerId)).toHaveLength(before + 1);
  });

  it("access_denied: stops, no key", async () => {
    const w = world(async () => ({ status: 400, json: { error: "access_denied" } }));
    const { body } = await start(w);
    const before = (await keysOf(ownerId)).length;
    const { res, body: out } = await poll(w, body.id);
    expect(res.status).toBe(403);
    expect(out).toEqual({ status: "access_denied" });
    expect(await keysOf(ownerId)).toHaveLength(before);
    expect((await poll(w, body.id)).body).toEqual({ status: "access_denied" });
  });

  it("expired_token: stops, no key", async () => {
    const w = world(async () => ({ status: 400, json: { error: "expired_token" } }));
    const { body } = await start(w);
    const before = (await keysOf(ownerId)).length;
    const { res, body: out } = await poll(w, body.id);
    expect(res.status).toBe(410);
    expect(out).toEqual({ status: "expired_token" });
    expect(await keysOf(ownerId)).toHaveLength(before);
  });

  it("past expires_at: expired without asking World", async () => {
    const w = world(async () => ({ status: 400, json: { error: "authorization_pending" } }));
    const { body } = await start(w);
    await db
      .update(s.deviceSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(s.deviceSessions.id, body.id));
    const calls = w.calls.length;
    expect((await poll(w, body.id)).body).toEqual({ status: "expired_token" });
    expect(w.calls).toHaveLength(calls);
  });

  it("a World ID that is no owner gets no key", async () => {
    const w = world(async () => ({
      json: { access_token: "at", token_type: "Bearer", id_token: await idp.sign(goodClaims({ sub: "stranger" })) },
    }));
    const { body } = await start(w);
    const { res, body: out } = await poll(w, body.id);
    expect(res.status).toBe(403);
    expect(out).toEqual({ status: "no_owner" });
  });

  it("a token without the orb credential gets no key", async () => {
    const w = world(async () => ({
      json: {
        access_token: "at",
        token_type: "Bearer",
        id_token: await idp.sign(goodClaims({ sub: ownerSub, acr: undefined })),
      },
    }));
    const { body } = await start(w);
    const before = (await keysOf(ownerId)).length;
    const { res, body: out } = await poll(w, body.id);
    expect(res.status).toBe(403);
    expect(out).toEqual({ status: "rejected", code: "ACR" });
    expect(await keysOf(ownerId)).toHaveLength(before);
  });

  it("a token for another client gets no key", async () => {
    const w = world(async () => ({
      json: {
        access_token: "at",
        token_type: "Bearer",
        id_token: await idp.sign(goodClaims({ sub: ownerSub, aud: `${CLIENT_ID}-other` })),
      },
    }));
    const { body } = await start(w);
    const { body: out } = await poll(w, body.id);
    expect(out).toEqual({ status: "rejected", code: "AUD" });
  });

  it("unknown or malformed id is 404", async () => {
    const w = world(async () => ({ json: {} }));
    expect((await poll(w, randomUUID())).res.status).toBe(404);
    expect((await poll(w, "nope")).res.status).toBe(404);
  });
});
