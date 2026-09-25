import { unsealData } from "iron-session";
import { describe, expect, it } from "vitest";
import { unseal } from "../crypto/seal";
import { MAINT_COOKIE, type MaintSession } from "../claim/session";
import { fakeGitHub } from "./__fixtures__/fake-github";
import { callback, login, type MaintainerUpsert, type OAuthConfig } from "./oauth";

const APP = "https://credits.test";
const SECRET = "a-session-secret-that-is-32-bytes-long!!";

function setup() {
  const gh = fakeGitHub();
  const saved: MaintainerUpsert[] = [];
  const cfg: OAuthConfig = {
    clientId: "cid",
    clientSecret: "csecret",
    appUrl: APP,
    secret: SECRET,
    fetch: gh.fetch,
    maintainers: {
      async upsert(m) {
        saved.push(m);
        return "maint-1";
      },
    },
  };
  return { gh, saved, cfg };
}

const cookieOf = (res: Response) => {
  const c = res.headers.get("set-cookie") ?? "";
  const m = c.match(new RegExp(`${MAINT_COOKIE}=([^;]+)`));
  return m ? m[1] : "";
};
const readCookie = (value: string) => unsealData<MaintSession>(value, { password: SECRET });

async function startLogin(cfg: OAuthConfig, pkg = "@acme/lib") {
  const res = await login(new Request(`${APP}/api/github/login?pkg=${encodeURIComponent(pkg)}`), cfg);
  return { res, cookie: cookieOf(res), location: new URL(res.headers.get("location")!) };
}

describe("GET /api/github/login", () => {
  it("redirects to GitHub with public_repo, state and PKCE, and keeps the state in ec_maint", async () => {
    const { cfg } = setup();
    const { res, cookie, location } = await startLogin(cfg);
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("cid");
    expect(location.searchParams.get("scope")).toBe("public_repo");
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP}/api/github/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const session = await readCookie(cookie);
    expect(session.oauth?.state).toBe(location.searchParams.get("state"));
    expect(session.oauth?.pkg).toBe("@acme/lib");
  });

  it("400 on an invalid package name", async () => {
    const { cfg } = setup();
    const res = await login(new Request(`${APP}/api/github/login?pkg=..%2Fx`), cfg);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/github/callback", () => {
  it("rejects a state that does not match the cookie, before exchanging the code", async () => {
    const { gh, cfg, saved } = setup();
    gh.codes.c1 = "gho_user";
    const { cookie } = await startLogin(cfg);
    const res = await callback(
      new Request(`${APP}/api/github/callback?code=c1&state=forged`, { headers: { cookie: `${MAINT_COOKIE}=${cookie}` } }),
      cfg,
    );
    expect(res.status).toBe(400);
    expect(saved).toHaveLength(0);
    expect(gh.calls.some((c) => c.path === "/login/oauth/access_token")).toBe(false);
  });

  it("stores the maintainer with a sealed token, signs them in and returns to /npm/<pkg>", async () => {
    const { gh, cfg, saved } = setup();
    gh.codes.c1 = "gho_user";
    gh.users.gho_user = { id: 42, login: "octo" };
    const { cookie, location } = await startLogin(cfg);
    const state = location.searchParams.get("state")!;
    const res = await callback(
      new Request(`${APP}/api/github/callback?code=c1&state=${state}`, { headers: { cookie: `${MAINT_COOKIE}=${cookie}` } }),
      cfg,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/npm/@acme/lib`);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ githubId: 42, githubLogin: "octo" });
    expect(saved[0].tokenEnc).not.toContain("gho_user");
    expect(unseal(saved[0].tokenEnc, SECRET)).toBe("gho_user");
    const session = await readCookie(cookieOf(res));
    expect(session.maintainerId).toBe("maint-1");
    expect(session.oauth).toBeUndefined();
  });

  it("does not sign in when GitHub rejects the code", async () => {
    const { cfg, saved } = setup();
    const { cookie, location } = await startLogin(cfg);
    const state = location.searchParams.get("state")!;
    const res = await callback(
      new Request(`${APP}/api/github/callback?code=bad&state=${state}`, { headers: { cookie: `${MAINT_COOKIE}=${cookie}` } }),
      cfg,
    );
    expect(res.status).toBe(400);
    expect(saved).toHaveLength(0);
  });
});
