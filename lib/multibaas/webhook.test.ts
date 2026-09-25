import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleMultiBaasWebhook, type WebhookDeps, type WebhookRepo } from "./webhook";

const SECRET = "whsec-test-only";
const NOW = 1_790_000_000;
const PAYER = "0xaf4C41858EDdb5Cf99c277Ee7755D918a0639Bb6";
const TIP = `0x${"7".repeat(64)}`;
const TX = `0x${"9".repeat(64)}`;

const input = (name: string, value: unknown, type: string) => ({ name, value, hashed: false, type });

function escrowEvent(name: string, inputs: unknown[], indexInLog = 0, id = "952699ad-717c-413c-ab58-0c779fa2fffc") {
  return {
    id,
    event: "event.emitted",
    data: {
      triggeredAt: "2026-09-26T10:00:00+09:00",
      event: {
        name,
        signature: `${name}(...)`,
        inputs,
        rawFields: "{}",
        contract: { address: "0x1111111111111111111111111111111111111111", addressLabel: "escrow", name: "EndCreditsEscrow", label: "endcredits_escrow" },
        indexInLog,
      },
      transaction: { from: "0xc8e1Bc6B6c1AD5275935B313288b2c6FF45472A8", txHash: TX, blockNumber: 47300000 },
    },
  };
}

const held = (indexInLog = 0, id?: string) =>
  escrowEvent(
    "Held",
    [
      input("tipId", TIP, "bytes32"),
      input("packageKey", `0x${"a".repeat(64)}`, "bytes32"),
      input("payer", PAYER, "address"),
      input("payee", "0x2222222222222222222222222222222222222222", "address"),
      input("amount", "250000", "uint256"),
      input("reason", "1", "uint8"),
      input("expiresAt", "1790086400", "uint64"),
    ],
    indexInLog,
    id,
  );

const usdcTransfer = {
  id: "78274107-0db5-4c02-b80e-eff6430a4cc3",
  event: "event.emitted",
  data: {
    triggeredAt: "2026-09-26T10:00:00+09:00",
    event: {
      name: "Transfer",
      signature: "Transfer(address,address,uint256)",
      inputs: [input("from", PAYER, "address"), input("to", PAYER, "address"), input("value", "1", "uint256")],
      contract: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", addressLabel: "usdc", name: "FiatToken", label: "usdc" },
      indexInLog: 3,
    },
    transaction: { from: PAYER, txHash: TX, blockNumber: 47300001 },
  },
};

function sign(raw: string, ts: number | string, secret = SECRET) {
  return createHmac("sha256", secret).update(raw).update(String(ts)).digest("hex");
}

function request(body: unknown, opts: { ts?: number; signature?: string } = {}) {
  const raw = JSON.stringify(body);
  const ts = opts.ts ?? NOW;
  return { raw: new TextEncoder().encode(raw), timestamp: String(ts), signature: opts.signature ?? sign(raw, ts) };
}

/** In-memory repo with the same unique-key behaviour as webhook_events.event_id. */
function memoryRepo() {
  const seen = new Set<string>();
  const notifications: { payer: string; tipId: string }[] = [];
  const repo = {
    insertEvent: vi.fn(async (e: { eventId: string }) => {
      if (seen.has(e.eventId)) return false;
      seen.add(e.eventId);
      return true;
    }),
    notifyHeld: vi.fn(async (payer: string, tipId: string) => {
      notifications.push({ payer, tipId });
      return 1;
    }),
    transaction: vi.fn(async <T>(fn: (r: WebhookRepo) => Promise<T>) => fn(repo)),
  };
  return { repo: repo as unknown as WebhookRepo & typeof repo, notifications, seen };
}

function deps(repo: WebhookRepo): WebhookDeps & { invalidate: ReturnType<typeof vi.fn> } {
  return { repo, secret: SECRET, now: () => NOW * 1000, invalidate: vi.fn() };
}

describe("multibaas webhook", () => {
  it("bad signature → 401 and nothing stored", async () => {
    const { repo } = memoryRepo();
    const req = request([held()], { signature: sign("something else", NOW) });
    const res = await handleMultiBaasWebhook(req, deps(repo));
    expect(res.status).toBe(401);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("signature made with another secret → 401", async () => {
    const { repo } = memoryRepo();
    const raw = JSON.stringify([held()]);
    const res = await handleMultiBaasWebhook(
      { raw: new TextEncoder().encode(raw), timestamp: String(NOW), signature: sign(raw, NOW, "other") },
      deps(repo),
    );
    expect(res.status).toBe(401);
  });

  it("missing headers → 401", async () => {
    const { repo } = memoryRepo();
    const res = await handleMultiBaasWebhook({ ...request([held()]), signature: null }, deps(repo));
    expect(res.status).toBe(401);
  });

  it("stale timestamp (older than 5 min) → 401 even when correctly signed", async () => {
    const { repo } = memoryRepo();
    const res = await handleMultiBaasWebhook(request([held()], { ts: NOW - 301 }), deps(repo));
    expect(res.status).toBe(401);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("a Held event stores the event and notifies the owner of the payer", async () => {
    const { repo, notifications } = memoryRepo();
    const d = deps(repo);
    const res = await handleMultiBaasWebhook(request([held()]), d);
    expect(res.status).toBe(200);
    expect(repo.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: `${TX}:0`, kind: "Held", payload: expect.objectContaining({ multibaasId: "952699ad-717c-413c-ab58-0c779fa2fffc" }) }),
    );
    expect(notifications).toEqual([{ payer: PAYER, tipId: TIP }]);
    expect(d.invalidate).toHaveBeenCalled();
  });

  it("duplicate delivery → one notification", async () => {
    const { repo, notifications } = memoryRepo();
    const d = deps(repo);
    await handleMultiBaasWebhook(request([held()]), d);
    // a retry may carry a new MultiBaas id; the chain position is the key
    const res = await handleMultiBaasWebhook(request([held(0, "another-delivery-id")]), d);
    expect(res.status).toBe(200);
    expect(notifications).toHaveLength(1);
  });

  it("a USDC transfer is dropped without any DB write", async () => {
    const { repo } = memoryRepo();
    const d = deps(repo);
    const res = await handleMultiBaasWebhook(request([usdcTransfer]), d);
    expect(res.status).toBe(200);
    expect(repo.transaction).not.toHaveBeenCalled();
    expect(repo.insertEvent).not.toHaveBeenCalled();
    expect(repo.notifyHeld).not.toHaveBeenCalled();
    expect(d.invalidate).not.toHaveBeenCalled();
  });

  it("an escrow event outside the dashboard set (ClaimSet) is dropped", async () => {
    const { repo } = memoryRepo();
    const res = await handleMultiBaasWebhook(request([escrowEvent("ClaimSet", [])]), deps(repo));
    expect(res.status).toBe(200);
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("a Released event is stored but notifies nobody", async () => {
    const { repo, notifications } = memoryRepo();
    const released = escrowEvent("Released", [input("tipId", TIP, "bytes32")], 1);
    await handleMultiBaasWebhook(request([usdcTransfer, released]), deps(repo));
    expect(repo.insertEvent).toHaveBeenCalledTimes(1);
    expect(notifications).toHaveLength(0);
  });

  it("a body that is not an array → 400", async () => {
    const { repo } = memoryRepo();
    const res = await handleMultiBaasWebhook(request({ id: "x" }), deps(repo));
    expect(res.status).toBe(400);
  });
});
