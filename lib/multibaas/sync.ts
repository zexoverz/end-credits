// Keeps the saved `paid_totals` query filtering every owner's payer (multi-owner): when the set of
// payers changes (a new owner signs up), it is saved again. One PUT per change, none otherwise.
import type { MultiBaasClient } from "./client";
import { QUERY_LABELS, savedQueries } from "./queries";

export function paidQuerySync(mb: MultiBaasClient, payers: () => Promise<string[]>) {
  let saved: string | null = null;
  return async (): Promise<boolean> => {
    const list = [...new Set((await payers()).map((p) => p.toLowerCase()))].sort();
    const key = list.join(",");
    if (list.length === 0 || key === saved) return false;
    await mb.put(`/queries/${QUERY_LABELS.paid}`, savedQueries(list).paid_totals);
    saved = key;
    return true;
  };
}
