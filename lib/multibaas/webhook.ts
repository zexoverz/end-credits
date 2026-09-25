// POST /api/webhooks/multibaas (DESIGN §15). MultiBaas posts a JSON array of `event.emitted`
// items for every synced contract, so with USDC linked most of the traffic is unrelated USDC
// transfers (~0.44/s on Base Sepolia). Order: verify the HMAC over the exact body bytes, reject
// stale timestamps, then drop everything that is not one of our escrow events before touching the DB.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ESCROW_ALIAS } from "./queries";

export const MAX_SKEW_SECONDS = 300;
export const WEBHOOK_EVENTS = new Set(["Held", "Released", "Refunded", "Reserved", "Claimed", "SessionSettled"]);

export interface StoredEvent {
  eventId: string; // `${txHash}:${indexInLog}`, unique in webhook_events
  kind: string;
  payload: unknown;
}

export interface WebhookRepo {
  /** false when event_id is already stored (a redelivery). */
  insertEvent(e: StoredEvent): Promise<boolean>;
  /** Inserts a `held` notification for every owner whose payer_address is `payer`. */
  notifyHeld(payer: string, tipId: string): Promise<number>;
  transaction<T>(fn: (repo: WebhookRepo) => Promise<T>): Promise<T>;
}

export interface WebhookDeps {
  repo: WebhookRepo;
  secret: string;
  now?: () => number;
  invalidate?: () => void;
}

export interface WebhookRequest {
  raw: Uint8Array;
  signature: string | null;
  timestamp: string | null;
}

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

export function verifySignature(req: WebhookRequest, secret: string, nowMs: number): boolean {
  const { signature, timestamp } = req;
  if (!signature || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(req.raw).update(timestamp).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

interface EventInput {
  name?: unknown;
  value?: unknown;
}

interface Relevant {
  id: unknown;
  name: string;
  inputs: EventInput[];
  eventId: string;
  payload: unknown;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (typeof v === "object" && v !== null ? (v as Obj) : undefined);

/** Returns the item when it is one of our escrow events, else undefined. Cheap checks first. */
export function relevant(item: unknown): Relevant | undefined {
  const it = obj(item);
  if (it?.event !== "event.emitted") return undefined;
  const data = obj(it.data);
  const ev = obj(data?.event);
  const contract = obj(ev?.contract);
  // The docs' sample names the alias `addressLabel`; the SDK type calls it `addressAlias`.
  const alias = contract?.addressLabel ?? contract?.addressAlias;
  if (alias !== ESCROW_ALIAS) return undefined;
  const name = ev?.name;
  if (typeof name !== "string" || !WEBHOOK_EVENTS.has(name)) return undefined;
  const tx = obj(data?.transaction);
  const txHash = tx?.txHash;
  const index = ev?.indexInLog;
  if (typeof txHash !== "string" || typeof index !== "number") return undefined;
  const inputs = Array.isArray(ev?.inputs) ? (ev.inputs as EventInput[]) : [];
  return {
    id: it.id,
    name,
    inputs,
    eventId: `${txHash.toLowerCase()}:${index}`,
    payload: {
      multibaasId: it.id,
      triggeredAt: data?.triggeredAt,
      event: { name, signature: ev?.signature, inputs, contract, indexInLog: index },
      transaction: { txHash, blockNumber: tx?.blockNumber, from: tx?.from },
    },
  };
}

function inputValue(inputs: EventInput[], name: string, index: number): string | undefined {
  const v = (inputs.find((i) => i.name === name) ?? inputs[index])?.value;
  return typeof v === "string" ? v : undefined;
}

export async function handleMultiBaasWebhook(req: WebhookRequest, deps: WebhookDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  if (!verifySignature(req, deps.secret, now())) return reply(401, { error: "unauthorized" });

  let items: unknown;
  try {
    items = JSON.parse(new TextDecoder().decode(req.raw));
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  if (!Array.isArray(items)) return reply(400, { error: "invalid_body" });

  const ours = items.map(relevant).filter((x): x is Relevant => x !== undefined);
  let stored = 0;
  for (const ev of ours) {
    const fresh = await deps.repo.transaction(async (repo) => {
      if (!(await repo.insertEvent({ eventId: ev.eventId, kind: ev.name, payload: ev.payload }))) return false;
      if (ev.name === "Held") {
        const payer = inputValue(ev.inputs, "payer", 2);
        const tipId = inputValue(ev.inputs, "tipId", 0);
        if (payer && tipId) await repo.notifyHeld(payer, tipId);
      }
      return true;
    });
    if (fresh) stored++;
  }
  if (stored > 0) deps.invalidate?.();
  return reply(200, { received: items.length, stored });
}
