// Integration: real Postgres. Run with TEST_DATABASE_URL set (migrated); skipped otherwise.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  APP,
  connect,
  HELD_TEXT,
  makeOwner,
  PAYEE,
  req,
  seedHold,
  signInCookie,
  TEST_DB,
} from "../__fixtures__/owner-db";

type Conn = Awaited<ReturnType<typeof connect>>;

describe.skipIf(!TEST_DB)("owner API (integration)", () => {
  let h: typeof import("./handlers");
  let uploadSession: (req: Request) => Promise<Response>;
  let db: Conn["db"];
  let s: Conn["s"];
  let ownerId: string;
  let cookie: string;

  beforeAll(async () => {
    ({ db, s } = await connect());
    ownerId = await makeOwner(db, s);
    cookie = await signInCookie(ownerId);
    h = await import("./handlers");
    ({ POST: uploadSession } = await import("@/app/api/sessions/route"));
  });

  const json = (method: string, body: unknown, c = cookie) =>
    req("/api/owner", { method, body: JSON.stringify(body), cookie: c });

  describe("settings", () => {
    it("401 without an owner session", async () => {
      expect((await h.handleGetSettings(req("/api/owner/settings"))).status).toBe(401);
      expect((await h.handlePutSettings(json("PUT", { packageCap: "0.1" }, ""))).status).toBe(401);
    });

    it("reads defaults as USDC strings", async () => {
      const res = await h.handleGetSettings(req("/api/owner/settings", { cookie }));
      expect(await res.json()).toEqual({
        sessionBudget: "2",
        packageCap: "0.25",
        dailyLimit: "20",
        holdTtlSeconds: 86400,
        settleMode: "auto",
      });
    });

    it("updates from USDC strings and stores micro-USDC", async () => {
      const res = await h.handlePutSettings(
        json("PUT", { sessionBudget: "3.5", packageCap: "0.5", holdTtlSeconds: 60, settleMode: "on_open" }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ sessionBudget: "3.5", packageCap: "0.5", dailyLimit: "20" });
      const [row] = await db.select().from(s.owners).where(eq(s.owners.id, ownerId));
      expect(row.sessionBudgetMicro).toBe(BigInt(3_500_000));
      expect(row.packageCapMicro).toBe(BigInt(500_000));
      expect(row.holdTtlSeconds).toBe(60);
      expect(row.settleMode).toBe("on_open");
    });

    it.each([
      [{ packageCap: "-1" }],
      [{ packageCap: "0" }],
      [{ packageCap: "0.0000001" }],
      [{ packageCap: "1e3" }],
      [{ sessionBudget: "100.01" }],
      [{ dailyLimit: "1000.01" }],
      [{ holdTtlSeconds: 59 }],
      [{ holdTtlSeconds: 604801 }],
      [{ settleMode: "later" }],
      [{ packageCap: 0.1 }],
      [{ payerAddress: PAYEE }],
      [{}],
      [{ packageCap: "5", sessionBudget: "4" }],
    ])("400 on %j", async (body) => {
      const res = await h.handlePutSettings(json("PUT", body));
      expect(res.status).toBe(400);
    });

    it("400 when the cap would exceed the stored budget", async () => {
      await h.handlePutSettings(json("PUT", { sessionBudget: "1", packageCap: "0.25" }));
      expect((await h.handlePutSettings(json("PUT", { packageCap: "1.5" }))).status).toBe(400);
    });
  });

  describe("agent keys", () => {
    const create = (label: unknown, c = cookie) =>
      h.handleCreateKey(req("/api/owner/keys", { method: "POST", body: JSON.stringify({ label }), cookie: c }));
    const upload = (token: string) =>
      uploadSession(
        new Request(`${APP}/api/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ claudeSessionId: crypto.randomUUID(), packages: [] }),
        }),
      );

    it("401 without an owner session", async () => {
      expect((await create("x", "")).status).toBe(401);
      expect((await h.handleListKeys(req("/api/owner/keys"))).status).toBe(401);
      expect((await h.handleRevokeKey(req("/", { method: "DELETE" }), crypto.randomUUID())).status).toBe(401);
    });

    it("400 on a bad label", async () => {
      expect((await create("")).status).toBe(400);
      expect((await create("x".repeat(101))).status).toBe(400);
      expect((await create(3)).status).toBe(400);
    });

    it("creates a key, shows the token once, stores only its sha256, and revokes it", async () => {
      const res = await create("MacBook, Claude Code");
      expect(res.status).toBe(201);
      const key = await res.json();
      expect(key.token).toMatch(/^ec_[A-Za-z0-9_-]{43}$/);
      const [row] = await db.select().from(s.agentKeys).where(eq(s.agentKeys.id, key.id));
      const { createHash } = await import("node:crypto");
      expect(row.tokenHash).toBe(createHash("sha256").update(key.token).digest("hex"));
      expect(row).toMatchObject({ ownerId, label: "MacBook, Claude Code", boundVia: "dev", revokedAt: null });

      const list = await (await h.handleListKeys(req("/api/owner/keys", { cookie }))).json();
      const listed = list.keys.find((k: { id: string }) => k.id === key.id);
      expect(listed).toMatchObject({ label: "MacBook, Claude Code", revokedAt: null });
      expect(JSON.stringify(list)).not.toContain(key.token);
      expect(JSON.stringify(list)).not.toContain(row.tokenHash);

      expect((await upload(key.token)).status).toBe(201);
      const del = await h.handleRevokeKey(req("/", { method: "DELETE", cookie }), key.id);
      expect(del.status).toBe(200);
      expect((await upload(key.token)).status).toBe(401);
      const [after] = await db.select().from(s.agentKeys).where(eq(s.agentKeys.id, key.id));
      expect(after.revokedAt).toBeInstanceOf(Date);
    });

    it("cannot revoke another owner's key (404)", async () => {
      const other = await makeOwner(db, s);
      const otherCookie = await signInCookie(other);
      const key = await (await create("theirs", otherCookie)).json();
      const res = await h.handleRevokeKey(req("/", { method: "DELETE", cookie }), key.id);
      expect(res.status).toBe(404);
      const [row] = await db.select().from(s.agentKeys).where(eq(s.agentKeys.id, key.id));
      expect(row.revokedAt).toBeNull();
      expect((await upload(key.token)).status).toBe(201);
    });

    it("404 for a malformed id", async () => {
      expect((await h.handleRevokeKey(req("/", { method: "DELETE", cookie }), "nope")).status).toBe(404);
    });
  });

  describe("summary", () => {
    it("401 without an owner session", async () => {
      expect((await h.handleSummary(req("/api/owner"), { balanceOf: async () => BigInt(0) })).status).toBe(401);
    });

    it("shows the payer balance, pending holds and unread notifications", async () => {
      const seeded = await seedHold(db, s, ownerId);
      const expired = await seedHold(db, s, ownerId, { expiresAt: new Date(Date.now() - 1000) });
      await db.insert(s.notifications).values([
        { ownerId, kind: "held", holdId: seeded.holdId },
        { ownerId, kind: "held", holdId: expired.holdId, readAt: new Date() },
      ]);
      const other = await makeOwner(db, s);
      const theirs = await seedHold(db, s, other);

      const asked: string[] = [];
      const res = await h.handleSummary(req("/api/owner", { cookie }), {
        balanceOf: async (a) => {
          asked.push(a);
          return BigInt(12_340_000);
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(asked).toEqual(["0x00000000000000000000000000000000000000aa"]);
      expect(body.payer).toEqual({
        address: "0x00000000000000000000000000000000000000aa",
        usdcBalance: "12.34",
        error: null,
      });
      const hold = body.pendingHolds.find((p: { tipId: string }) => p.tipId === seeded.tipId);
      expect(hold).toMatchObject({
        package: seeded.packageName,
        amount: "0.15",
        payee: PAYEE,
        reason: HELD_TEXT,
        expired: false,
        sessionId: seeded.sessionId,
      });
      expect(body.pendingHolds.find((p: { tipId: string }) => p.tipId === expired.tipId).expired).toBe(true);
      expect(body.pendingHolds.some((p: { tipId: string }) => p.tipId === theirs.tipId)).toBe(false);
      expect(body.notifications.unread).toBe(1);
      expect(body.notifications.items).toEqual([
        expect.objectContaining({ kind: "held", holdId: seeded.holdId, tipId: seeded.tipId }),
      ]);
      expect(body.settings.settleMode).toBeDefined();
    });

    it("still answers when the balance read fails, without the RPC error text", async () => {
      const res = await h.handleSummary(req("/api/owner", { cookie }), {
        balanceOf: async () => {
          throw new Error("fetch failed https://rpc.example/secret-key");
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.payer).toMatchObject({ usdcBalance: null, error: "rpc_unavailable" });
      expect(JSON.stringify(body)).not.toContain("secret-key");
    });
  });
});
