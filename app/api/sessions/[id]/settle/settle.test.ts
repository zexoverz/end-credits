// Integration: POST /api/sessions/:id/settle against a real Postgres. Run with TEST_DATABASE_URL set
// (migrated); skipped otherwise.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getIronSession, webCookies } from "iron-session";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;
const APP_URL = "https://credits.test";
const SECRET = "x".repeat(40);
const DEV_TOKEN = `dev_${randomUUID()}`;

type Ctx = { params: Promise<{ id: string }> };
type Mod = { POST: (req: Request, ctx: Ctx) => Promise<Response> };

describe.skipIf(!DB_URL)("POST /api/sessions/:id/settle (integration)", () => {
  let post: Mod["POST"];
  let db: typeof import("@/lib/db/client").db;
  let s: typeof import("@/lib/db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    process.env.APP_URL = APP_URL;
    process.env.SESSION_SECRET = SECRET;
    process.env.OWNER_DEV_TOKEN = DEV_TOKEN;
    ({ POST: post } = (await import("./route")) as Mod);
    ({ db } = await import("@/lib/db/client"));
    s = await import("@/lib/db/schema");
  });

  afterEach(() => {
    delete process.env.WORLD_REQUIRED;
  });

  async function seed(status = "uploaded") {
    const [owner] = await db()
      .insert(s.owners)
      .values({ displayName: "t", payerAddress: "0x0000000000000000000000000000000000000001", settleMode: "on_open" })
      .returning();
    const [key] = await db()
      .insert(s.agentKeys)
      .values({ ownerId: owner.id, label: "k", tokenHash: randomUUID(), boundVia: "dev" })
      .returning();
    const [session] = await db()
      .insert(s.sessions)
      .values({ ownerId: owner.id, agentKeyId: key.id, claudeSessionId: randomUUID(), sessionKey: "0x00", status })
      .returning();
    return { ownerId: owner.id, id: session.id };
  }

  async function ownerCookie(ownerId: string): Promise<string> {
    const headers = new Headers();
    const session = await getIronSession<{ ownerId?: string }>(webCookies(new Request(APP_URL), headers), {
      password: SECRET,
      cookieName: "ec_owner",
    });
    session.ownerId = ownerId;
    await session.save();
    return headers.get("set-cookie")!.split(";")[0];
  }

  const press = (id: string, headers: Record<string, string> = {}) =>
    post(new Request(`${APP_URL}/api/sessions/${id}/settle`, { method: "POST", headers }), {
      params: Promise.resolve({ id }),
    });

  const requested = async (id: string) =>
    (await db().select().from(s.sessions).where(eq(s.sessions.id, id)))[0].settleRequestedAt;

  it("202 for the owner, then 409 on the second press", async () => {
    const { ownerId, id } = await seed();
    const cookie = await ownerCookie(ownerId);
    const first = await press(id, { cookie });
    expect(first.status).toBe(202);
    expect(await requested(id)).toBeInstanceOf(Date);
    expect((await press(id, { cookie })).status).toBe(409);
  });

  it("409 when the session is not waiting in 'uploaded'", async () => {
    const { ownerId, id } = await seed("settled");
    expect((await press(id, { cookie: await ownerCookie(ownerId) })).status).toBe(409);
    expect(await requested(id)).toBeNull();
  });

  it("401 without an owner session, 403 for another owner", async () => {
    const { id } = await seed();
    const other = await seed();
    expect((await press(id)).status).toBe(401);
    expect((await press(id, { cookie: "ec_owner=garbage" })).status).toBe(401);
    expect((await press(id, { cookie: await ownerCookie(other.ownerId) })).status).toBe(403);
    expect(await requested(id)).toBeNull();
  });

  it("accepts the dev token only while World is not required", async () => {
    const { id } = await seed();
    process.env.WORLD_REQUIRED = "true";
    expect((await press(id, { authorization: `Bearer ${DEV_TOKEN}` })).status).toBe(401);
    delete process.env.WORLD_REQUIRED;
    expect((await press(id, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await press(id, { authorization: `Bearer ${DEV_TOKEN}` })).status).toBe(202);
  });

  it("404 for an unknown or malformed id", async () => {
    expect((await press(randomUUID(), { authorization: `Bearer ${DEV_TOKEN}` })).status).toBe(404);
    expect((await press("nope", { authorization: `Bearer ${DEV_TOKEN}` })).status).toBe(404);
  });
});
