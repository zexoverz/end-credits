// HTTP handlers behind app/api/owner/*. Every one requires the owner (cookie or dev bearer).
import { isAddress, type Address } from "viem";
import { z } from "zod";
import { withOwner } from "../auth/owner";
import { getApprover, setOwnerApprover, type ApproverChain } from "./approver";
import { getBudget, setBudgetOwner, type BudgetChain } from "./budget";
import { createKey, keyInput, listKeys, revokeKey } from "./keys";
import { ownerOnboarding, type OnboardingDeps } from "./onboarding";
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

function result(r: { error: string; status: number } | object): Response {
  if ("status" in r && "error" in r) {
    const { status, ...rest } = r as { status: number; error: string };
    return Response.json(rest, { status });
  }
  return Response.json(r, { headers: noStore });
}

const approverInput = z.object({ address: z.string().refine((a) => isAddress(a, { strict: false })) });

/** A chain fixed for tests, or built for the signed-in owner (its own payer key). */
export type PerOwner<T> = T | ((ownerId: string) => Promise<T>);
const forOwner = <T>(c: PerOwner<T>, ownerId: string): Promise<T> =>
  typeof c === "function" ? (c as (id: string) => Promise<T>)(ownerId) : Promise.resolve(c);

/** GET /api/owner/approver → { approver, onchain, pending }. */
export function handleGetApprover(req: Request, chain: PerOwner<ApproverChain>): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => result(await getApprover(ownerId, await forOwner(chain, ownerId))));
}

/** POST /api/owner/approver { address } → { approver, onchain, pending, tx }. */
export function handleSetApprover(req: Request, chain: PerOwner<ApproverChain>): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const parsed = approverInput.safeParse(await body(req));
    if (!parsed.success) return invalid(z.flattenError(parsed.error).fieldErrors);
    return result(await setOwnerApprover(ownerId, parsed.data.address as Address, await forOwner(chain, ownerId)));
  });
}

const budgetInput = z.object({ address: z.string().refine((a) => isAddress(a, { strict: false })) });

/** GET /api/owner/budget → the budget wallet and its on-chain allowance for our hot key. */
export function handleGetBudget(req: Request, chain: BudgetChain): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const view = await getBudget(ownerId, chain);
    return view ? Response.json(view, { headers: noStore }) : notFound();
  });
}

/** POST /api/owner/budget { address } → stores the owner's funding wallet, answers as GET. */
export function handleSetBudget(req: Request, chain: BudgetChain): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const parsed = budgetInput.safeParse(await body(req));
    if (!parsed.success) return invalid(z.flattenError(parsed.error).fieldErrors);
    const view = await setBudgetOwner(ownerId, parsed.data.address, chain);
    return view ? Response.json(view, { headers: noStore }) : notFound();
  });
}

/** GET /api/owner/onboarding → { steps: [{ id, done, detail, href }], next }. */
export function handleOnboarding(req: Request, deps: OnboardingDeps): Promise<Response> {
  return withOwner(req, async ({ ownerId }) => {
    const onboarding = await ownerOnboarding(ownerId, deps);
    return onboarding ? Response.json(onboarding, { headers: noStore }) : notFound();
  });
}
