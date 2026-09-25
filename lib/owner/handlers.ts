// HTTP handlers behind app/api/owner/*. Every one requires the owner (cookie or dev bearer).
import { z } from "zod";
import { withOwner } from "../auth/owner";
import { createKey, keyInput, listKeys, revokeKey } from "./keys";
import { ownerRow, settingsInput, settingsView, updateSettings } from "./settings";
import { ownerSummary, type SummaryDeps } from "./summary";

const noStore = { "cache-control": "no-store" };
const notFound = () => Response.json({ error: "not_found" }, { status: 404 });
const invalid = (issues?: unknown) => Response.json({ error: "invalid_body", issues }, { status: 400 });

async function body(req: Request): Promise<unknown> {
  return req.json().catch(() => undefined);
}

export function handleSummary(req: Request, deps: SummaryDeps): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const summary = await ownerSummary(ownerId, deps);
    return summary ? Response.json(summary, { headers: noStore }) : notFound();
  });
}

export function handleGetSettings(req: Request): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const row = await ownerRow(ownerId);
    return row ? Response.json(settingsView(row), { headers: noStore }) : notFound();
  });
}

export function handlePutSettings(req: Request): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const parsed = settingsInput.safeParse(await body(req));
    if (!parsed.success) return invalid(z.flattenError(parsed.error).fieldErrors);
    const r = await updateSettings(ownerId, parsed.data);
    return r.ok ? Response.json(r.settings) : invalid({ packageCap: [r.error] });
  });
}

export function handleListKeys(req: Request): Promise<Response> {
  return withOwner(req, async ({ ownerId }) =>
    Response.json({ keys: await listKeys(ownerId) }, { headers: noStore }),
  );
}

export function handleCreateKey(req: Request): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const parsed = keyInput.safeParse(await body(req));
    if (!parsed.success) return invalid(z.flattenError(parsed.error).fieldErrors);
    const key = await createKey(ownerId, parsed.data.label);
    return Response.json(key, { status: 201, headers: noStore });
  });
}

export function handleRevokeKey(req: Request, id: string): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    const key = await revokeKey(ownerId, id);
    return key ? Response.json(key) : notFound();
  });
}
