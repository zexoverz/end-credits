import type { Action } from "@/lib/multibaas/actions";
export type InboxItem = { action: Action; warning: Action | null };
/** Pair an expiry warning with its matching hold, without hiding either server explanation. */
export function inboxItems(actions: Action[]): InboxItem[] {
  const out: InboxItem[] = [];
  const holds = new Map<string, InboxItem>();
  for (const action of actions) {
    if (action.kind !== "reserve_waiting" && action.tipId) {
      const existing = holds.get(action.tipId);
      if (existing) {
        if (action.kind === "hold_expiring") existing.warning = action;
        else existing.action = action;
        continue;
      }
      const item = {
        action,
        warning: action.kind === "hold_expiring" ? action : null,
      };
      holds.set(action.tipId, item);
      out.push(item);
    } else out.push({ action, warning: null });
  }
  return out;
}
