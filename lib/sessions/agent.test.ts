// Integration: the agent-key routes against a real Postgres. Run with TEST_DATABASE_URL set
// (migrated); skipped otherwise.
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;
const APP = "https://credits.test";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

describe.skipIf(!DB_URL)("agent-key routes (integration)", () => {
  let agent: typeof import("./agent");
  let db: typeof import("@/lib/db/client").db;
  let s: typeof import("@/lib/db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    agent = await import("./agent");
    ({ db } = await import("@/lib/db/client"));
    s = await import("@/lib/db/schema");
  });

  async function seed(opts: { status?: string; revoked?: boolean } = {}) {
    const [owner] = await db()
      .insert(s.owners)
      .values({
        displayName: "t",
        payerAddress: "0x0000000000000000000000000000000000000001",
        settleMode: "on_open",
        sessionBudgetMicro: BigInt(3_000_000),
        packageCapMicro: BigInt(500_000),
      })
      .returning();
    const token = `ec_${randomUUID()}`;
    const [key] = await db()
      .insert(s.agentKeys)
      .values({
        ownerId: owner.id,
        label: "k",
        tokenHash: sha(token),
        boundVia: "dev",
        revokedAt: opts.revoked ? new Date() : null,
      })
      .returning();
    const [session] = await db()
      .insert(s.sessions)
      .values({
        ownerId: owner.id,
        agentKeyId: key.id,
        claudeSessionId: randomUUID(),
        sessionKey: "0x00",
        status: opts.status ?? "uploaded",
      })
      .returning();
    return { token, id: session.id, ownerId: owner.id };
  }

  const bearer = (token?: string): Record<string, string> =>
    token ? { authorization: `Bearer ${token}` } : {};
  const press = (id: string, token?: string) =>
    agent.handleAgentSettle(new Request(`${APP}/api/agent/sessions/${id}/settle`, { method: "POST", headers: bearer(token) }), id);
  const settings = (token?: string) =>
    agent.handleAgentSettings(new Request(`${APP}/api/agent/settings`, { headers: bearer(token) }));
  const requested = async (id: string) =>
    (await db().select().from(s.sessions).where(eq(s.sessions.id, id)))[0].settleRequestedAt;

  it("settle: 202 for the uploading key, then 409 on the second press", async () => {
    const { token, id } = await seed();
    expect((await press(id, token)).status).toBe(202);
    expect(await requested(id)).toBeInstanceOf(Date);
    const again = await press(id, token);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "not_settleable" });
  });

  it("settle: 409 when the session is not waiting in 'uploaded'", async () => {
    const { token, id } = await seed({ status: "settled" });
    expect((await press(id, token)).status).toBe(409);
    expect(await requested(id)).toBeNull();
  });

  it("settle: 401 without a key or with a revoked key", async () => {
    const { id } = await seed();
    const revoked = await seed({ revoked: true });
    expect((await press(id)).status).toBe(401);
    expect((await press(id, "ec_nope")).status).toBe(401);
    expect((await press(revoked.id, revoked.token)).status).toBe(401);
    expect(await requested(revoked.id)).toBeNull();
  });

  it("settle: 403 for another owner's session, 404 for an unknown id", async () => {
    const mine = await seed();
    const theirs = await seed();
    const res = await press(theirs.id, mine.token);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(await requested(theirs.id)).toBeNull();
    expect((await press(randomUUID(), mine.token)).status).toBe(404);
    expect((await press("nope", mine.token)).status).toBe(404);
  });

  it("settings: the key's owner limits; 401 for a revoked key", async () => {
    const { token } = await seed();
    const res = await settings(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      sessionBudget: "3",
      packageCap: "0.5",
      dailyLimit: "20",
      settleMode: "on_open",
    });
    expect((await settings()).status).toBe(401);
    expect((await settings((await seed({ revoked: true })).token)).status).toBe(401);
  });
});
