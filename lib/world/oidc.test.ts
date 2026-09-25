// Owner sign-in (T11.1): real Postgres, World's token endpoint faked by an injected fetch and ID tokens
// signed by a local key. Skipped without TEST_DATABASE_URL.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { APP, connect, req, TEST_DB } from "../__fixtures__/owner-db";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  fakeTokenEndpoint,
  goodClaims,
  ISSUER,
  startIdp,
  worldEnv,
  type Idp,
} from "./__fixtures__/idp";

type Conn = Awaited<ReturnType<typeof connect>>;

describe.skipIf(!TEST_DB)("world sign-in (integration)", () => {
  let idp: Idp;
  let db: Conn["db"];
  let s: Conn["s"];
  let oidc: typeof import("./oidc");
  let firstOwner: string;

  beforeAll(async () => {
    ({ db, s } = await connect());
    worldEnv();
    idp = await startIdp();
    oidc = await import("./oidc");
    const { devOwner } = await import("../__fixtures__/owner-db");
    firstOwner = await devOwner(db, s);
  });
  afterAll(() => idp.close());
  beforeEach(async () => {
    await db.update(s.owners).set({ iss: null, sub: null, subHash: null }).where(eq(s.owners.id, firstOwner));
  });

  /** Runs /start, then the callback with World's answer carrying `sub` (and any claim overrides). */
  async function signIn(opts: { sub: string; claims?: Record<string, unknown>; stateOverride?: string }) {
    const start = await oidc.handleSignInStart(req("/api/auth/world/start"));
    const location = new URL(start.headers.get("location")!);
    const cookie = start.headers.get("set-cookie")!.split(";")[0];
    const nonce = location.searchParams.get("nonce")!;
    const state = opts.stateOverride ?? location.searchParams.get("state")!;
    const token = fakeTokenEndpoint(async () => ({
      json: {
        access_token: "at",
        token_type: "Bearer",
        expires_in: 300,
        id_token: await idp.sign(goodClaims({ nonce, sub: opts.sub, ...opts.claims })),
      },
    }));
    const res = await oidc.handleSignInCallback(
      req(`/api/auth/world/callback?code=the-code&state=${state}`, { cookie }),
      { fetch: token.fetch, jwks: idp.jwks },
    );
    return { start, location, res, calls: token.calls };
  }

  it("start redirects to World's authorize with openid, S256 PKCE, state and nonce", async () => {
    const res = await oidc.handleSignInStart(req("/api/auth/world/start"));
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/api/v1/authorize`);
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe(CLIENT_ID);
    expect(p.get("redirect_uri")).toBe(`${APP}/api/auth/world/callback`);
    expect(p.get("scope")).toBe("openid");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(p.get("state")).toBeTruthy();
    expect(p.get("nonce")).toBeTruthy();
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^ec_world=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toContain(p.get("state")!);
  });

  it("first sign-in binds (iss, sub) to the seeded owner and signs in", async () => {
    const { res, calls } = await signIn({ sub: "human-a" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/owner`);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("ec_owner="))).toBe(true);
    const [owner] = await db.select().from(s.owners).where(eq(s.owners.id, firstOwner));
    expect(owner.iss).toBe(ISSUER);
    expect(owner.sub).toBe("human-a");
    const { subHash } = await import("./owner");
    expect(owner.subHash).toBe(subHash(ISSUER, "human-a"));

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toBe(`${ISSUER}/api/v1/token`);
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    expect(call.authorization).toBe(`Basic ${basic}`);
    expect(call.body.get("grant_type")).toBe("authorization_code");
    expect(call.body.get("code")).toBe("the-code");
    expect(call.body.get("redirect_uri")).toBe(`${APP}/api/auth/world/callback`);
    expect(call.body.get("code_verifier")).toBeTruthy();
    expect(call.body.get("client_secret")).toBeNull();
  });

  it("a later sign-in by the same human matches; another human is WRONG_HUMAN", async () => {
    await signIn({ sub: "human-a" });
    const again = await signIn({ sub: "human-a" });
    expect(again.res.headers.get("location")).toBe(`${APP}/owner`);
    const other = await signIn({ sub: "human-b" });
    expect(other.res.headers.get("location")).toBe(`${APP}/owner?world=WRONG_HUMAN`);
    expect(other.res.headers.getSetCookie().some((c) => c.startsWith("ec_owner="))).toBe(false);
    const [owner] = await db.select().from(s.owners).where(eq(s.owners.id, firstOwner));
    expect(owner.sub).toBe("human-a");
  });

  it("a state that is not the cookie's is refused before any token call", async () => {
    const { res, calls } = await signIn({ sub: "human-a", stateOverride: "forged" });
    expect(res.headers.get("location")).toBe(`${APP}/owner?world=STATE`);
    expect(calls).toHaveLength(0);
  });

  it("no cookie is refused before any token call", async () => {
    const res = await oidc.handleSignInCallback(req("/api/auth/world/callback?code=c&state=s"));
    expect(res.headers.get("location")).toBe(`${APP}/owner?world=STATE`);
  });

  it("a token without the orb credential signs nobody in", async () => {
    const { res } = await signIn({ sub: "human-a", claims: { acr: undefined } });
    expect(res.headers.get("location")).toBe(`${APP}/owner?world=ACR`);
    const [owner] = await db.select().from(s.owners).where(eq(s.owners.id, firstOwner));
    expect(owner.iss).toBeNull();
  });

  it("a token with another nonce is NONCE", async () => {
    const { res } = await signIn({ sub: "human-a", claims: { nonce: "not-this-one" } });
    expect(res.headers.get("location")).toBe(`${APP}/owner?world=NONCE`);
  });

  it("cancelled in World App", async () => {
    const res = await oidc.handleSignInCallback(req("/api/auth/world/callback?error=access_denied&state=s"));
    expect(res.headers.get("location")).toBe(`${APP}/owner?world=CANCELLED`);
  });
});
