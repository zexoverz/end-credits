"use client";
// Loads GET /api/history on mount and on Refresh; shows loading, error, empty or the table.
import { useCallback, useEffect, useState } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fill } from "@/lib/client/roll";
import { HISTORY_COPY } from "@/lib/copy/history";
import type { HistoryItem } from "@/lib/history/history";
import { HistoryRow } from "./history-row";

type State = { items: HistoryItem[] | null; error: string | null; loading: boolean };

function Table({ items }: { items: HistoryItem[] }) {
  const cols = HISTORY_COPY.COLS;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            {[cols.time, cols.package, cols.outcome, cols.amount, cols.reasons, cols.screens, cols.hold, cols.tx].map(
              (c) => (
                <th key={c} className="pb-2 pr-3 font-medium">
                  {c}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <HistoryRow key={item.creditId} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function History() {
  const [state, setState] = useState<State>({ items: null, error: null, loading: true });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await api<{ items: HistoryItem[] }>("/api/history", { cache: "no-store" });
      setState(res.ok ? { items: res.data.items, error: null, loading: false } : (s) => ({ ...s, error: res.error, loading: false }));
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e), loading: false }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">{HISTORY_COPY.INTRO}</p>
        <Button onClick={load} disabled={state.loading}>
          {state.loading ? HISTORY_COPY.LOADING : HISTORY_COPY.REFRESH}
        </Button>
      </div>
      {state.error && <ErrorBox>{fill(HISTORY_COPY.ERROR, { error: state.error })}</ErrorBox>}
      {state.items?.length === 0 && <p className="text-muted">{HISTORY_COPY.EMPTY}</p>}
      {state.items && state.items.length > 0 && <Table items={state.items} />}
    </div>
  );
}
