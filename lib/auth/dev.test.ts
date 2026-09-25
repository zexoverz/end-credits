// Integration: real Postgres. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { connect, DEV_TOKEN, devOwner, req, TEST_DB } from "../__fixtures__/owner-db";

describe.skipIf(!TEST_DB)("owner dev login (integration)", () => {
  let dev: typeof import("./dev");
  let auth: typeof import("./owner");
  let ownerId: string;

  beforeAll(async () => {
    const { db, s } = await connect();
    ownerId = await devOwner(db, s);
    dev = await import("./dev");
    auth = await import("./owner");
  });
  afterEach(() => {
    delete process.env.WORLD_REQUIRED;
  });

  const login = (token: unknown) =>
    dev.handleDevLogin(req("/api/auth/dev", { method: "POST", body: JSON.stringify({ token }) }));
  const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

  it("signs in as the first owner with the right token", async () => {
    const res = await login(DEV_TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ownerId });
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^ec_owner=/);
    expect(await auth.requireOwner(req("/", { cookie }))).toEqual({ ownerId });
  });

  it("401 with a wrong or missing token, and no cookie", async () => {
    for (const t of [`${DEV_TOKEN}x`, "", 42, undefined]) {
      const res = await login(t);
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("403 when WORLD_REQUIRED=true, even with the right token", async () => {
    process.env.WORLD_REQUIRED = "true";
    const res = await login(DEV_TOKEN);
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("the dev bearer works as the owner, and not when WORLD_REQUIRED=true", async () => {
    const bearer = () => req("/", { headers: { authorization: `Bearer ${DEV_TOKEN}` } });
    expect(await auth.requireOwner(bearer())).toEqual({ ownerId });
    process.env.WORLD_REQUIRED = "true";
    await expect(auth.requireOwner(bearer())).rejects.toMatchObject({ status: 401 });
  });

  it("logout clears the cookie", async () => {
    const res = dev.handleLogout(req("/api/auth/logout", { method: "POST" }));
    const out = await res;
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/^ec_owner=;.*Max-Age=0/i);
  });

  it("401 from requireOwner without a cookie", async () => {
    await expect(auth.requireOwner(req("/"))).rejects.toMatchObject({ status: 401 });
  });
});
