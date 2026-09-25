// Integration: real Postgres. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.TEST_DATABASE_URL;
const APP_URL = "https://credits.test";

type Mod = {
  POST: (req: Request) => Promise<Response>;
};
type GetMod = {
  GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

describe.skipIf(!DB_URL)("sessions API (integration)", () => {
  let post: Mod["POST"];
  let get: GetMod["GET"];
  let db: typeof import("@/lib/db/client").db;
  let s: typeof import("@/lib/db/schema");

  const tokens = { auto: `ec_${randomUUID()}`, onOpen: `ec_${randomUUID()}`, revoked: `ec_${randomUUID()}` };
  const sha = (t: string) => createHash("sha256").update(t).digest("hex");

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    process.env.APP_URL = APP_URL;
    ({ POST: post } = (await import("./route")) as Mod);
    ({ GET: get } = (await import("./[id]/route")) as GetMod);
    ({ db } = await import("@/lib/db/client"));
    s = await import("@/lib/db/schema");

    const owner = async (settleMode: "auto" | "on_open") =>
      (
        await db()
          .insert(s.owners)
          .values({ displayName: "t", payerAddress: "0x0000000000000000000000000000000000000001", settleMode })
          .returning()
      )[0];
    const auto = await owner("auto");
    const onOpen = await owner("on_open");
    await db().insert(s.agentKeys).values([
      { ownerId: auto.id, label: "a", tokenHash: sha(tokens.auto), boundVia: "dev" },
      { ownerId: onOpen.id, label: "b", tokenHash: sha(tokens.onOpen), boundVia: "dev" },
      { ownerId: auto.id, label: "r", tokenHash: sha(tokens.revoked), boundVia: "dev", revokedAt: new Date() },
    ]);
  });

  const body = (claudeSessionId = randomUUID()) => ({
    claudeSessionId,
    repoLabel: "reports-app",
    startedAt: "2026-09-26T01:00:00.000Z",
    endedAt: "2026-09-26T02:00:00.000Z",
    packages: [
      { name: "zod", version: "3.23.8", signals: { import: { count: 4 }, read: { count: 2, evidence: ["zod/a.d.ts", "zod/b.d.ts"] } } },
      { name: "viem", signals: { docs: { count: 1, evidence: ["https://viem.sh"] } } },
    ],
  });

  const upload = (payload: unknown, token?: string) =>
    post(
      new Request(`${APP_URL}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      }),
    );

  describe("POST /api/sessions", () => {
    it("401 without a key or with an unknown key", async () => {
      expect((await upload(body())).status).toBe(401);
      expect((await upload(body(), "ec_nope")).status).toBe(401);
    });

    it("401 with a revoked key", async () => {
      expect((await upload(body(), tokens.revoked)).status).toBe(401);
    });

    it("400 on an invalid body", async () => {
      const bad = { ...body(), packages: [{ name: "Zod", signals: { import: { count: 1 } } }] };
      expect((await upload(bad, tokens.auto)).status).toBe(400);
      const over = { ...body(), packages: [{ name: "zod", signals: { read: { count: 11 } } }] };
      expect((await upload(over, tokens.auto)).status).toBe(400);
    });

    it("stores the session and usage, and enqueues settlement in auto mode", async () => {
      const res = await upload(body(), tokens.auto);
      expect(res.status).toBe(201);
      const { id, url } = await res.json();
      expect(url).toBe(`${APP_URL}/credits/${id}`);
      const [row] = await db().select().from(s.sessions).where(eq(s.sessions.id, id));
      expect(row.sessionKey).toBe(keccak256(stringToBytes(id)));
      expect(row.settleRequestedAt).toBeInstanceOf(Date);
      expect(row.repoLabel).toBe("reports-app");
      expect(row.status).toBe("uploaded");
      const usage = await db().select().from(s.usage).where(eq(s.usage.sessionId, id));
      expect(usage.map((u) => [u.packageName, u.signal, u.count]).sort()).toEqual(
        [["viem", "docs", 1], ["zod", "import", 4], ["zod", "read", 2]].sort(),
      );
      expect(usage.find((u) => u.signal === "read")?.evidence).toEqual(["zod/a.d.ts", "zod/b.d.ts"]);
    });

    it("does not enqueue in on_open mode", async () => {
      const { id } = await (await upload(body(), tokens.onOpen)).json();
      const [row] = await db().select().from(s.sessions).where(eq(s.sessions.id, id));
      expect(row.settleRequestedAt).toBeNull();
    });

    it("is idempotent on (owner, claudeSessionId)", async () => {
      const payload = body();
      const first = await upload(payload, tokens.auto);
      const second = await upload(payload, tokens.auto);
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      const a = await first.json();
      expect(await second.json()).toEqual(a);
      const usage = await db().select().from(s.usage).where(eq(s.usage.sessionId, a.id));
      expect(usage).toHaveLength(3);
    });

    it("concurrent re-uploads of one session produce one row", async () => {
      const payload = body();
      const results = await Promise.all([1, 2, 3, 4].map(() => upload(payload, tokens.auto)));
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
      const ids = new Set(await Promise.all(results.map(async (r) => (await r.json()).id)));
      expect(ids.size).toBe(1);
      const rows = await db()
        .select()
        .from(s.sessions)
        .where(eq(s.sessions.claudeSessionId, payload.claudeSessionId));
      expect(rows).toHaveLength(1);
    });
  });

  describe("GET /api/sessions/:id", () => {
    const read = (id: string) => get(new Request(`${APP_URL}/api/sessions/${id}`), { params: Promise.resolve({ id }) });

    it("404 for an unknown or malformed id", async () => {
      expect((await read(randomUUID())).status).toBe(404);
      expect((await read("not-a-uuid")).status).toBe(404);
    });

    it("returns credits in roll order with amounts and short payees", async () => {
      const { id } = await (await upload(body(), tokens.auto)).json();
      const pkgRow = async (name: string) =>
        (
          await db()
            .insert(s.packages)
            .values({ name: `${name}-${randomUUID().slice(0, 8)}`, packageKey: `0x${randomUUID().replace(/-/g, "")}` })
            .returning()
        )[0];
      const [a, b, c, d] = await Promise.all(["a", "b", "c", "d"].map(pkgRow));
      const payee = "0x1234567890abcdef1234567890abcdef12345678";
      await db().insert(s.credits).values([
        { sessionId: id, packageId: a.id, score: 2, amountMicro: 90_000n, role: "thanks", outcome: "paid", payee },
        { sessionId: id, packageId: b.id, score: 9, amountMicro: 100_000n, role: "starring", outcome: "held", reasons: ["HELD_MEDIUM"] },
        { sessionId: id, packageId: c.id, score: 12, amountMicro: 250_000n, role: "starring", outcome: "paid", capped: true, payee, txHash: "0xabc" },
        { sessionId: id, packageId: d.id, score: 3, amountMicro: 50_000n, role: "research", outcome: "reserved" },
      ]);
      const res = await read(id);
      expect(res.status).toBe(200);
      const view = await res.json();
      expect(view.id).toBe(id);
      expect(view.status).toBe("uploaded");
      expect(view.credits.map((cr: { package: string }) => cr.package)).toEqual([c.name, b.name, d.name, a.name]);
      expect(view.credits[0]).toMatchObject({
        role: "starring",
        outcome: "paid",
        amount: "0.25",
        capped: true,
        txHash: "0xabc",
        payee: "0x1234…5678",
      });
      expect(view.credits[1]).toMatchObject({ amount: "0.1", payee: null, reasons: ["HELD_MEDIUM"] });
      expect(JSON.stringify(view)).not.toContain(payee);
    });
  });
});
