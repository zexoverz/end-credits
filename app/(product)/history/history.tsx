"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import { fill } from "@/lib/client/roll";
import { HISTORY_COPY as C } from "@/lib/copy/history";
import { EXPERIENCE as E } from "@/lib/copy/experience";
import type { HistoryItem } from "@/lib/history/history";
import { HistoryRow } from "./history-row";
type State = {
  items: HistoryItem[] | null;
  error: string | null;
  loading: boolean;
};
export function History() {
  const [state, setState] = useState<State>({
    items: null,
    error: null,
    loading: true,
  });
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("");
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await api<{ items: HistoryItem[] }>("/api/history", {
        cache: "no-store",
      });
      setState(
        res.ok
          ? { items: res.data.items, error: null, loading: false }
          : (s) => ({ ...s, error: res.error, loading: false }),
      );
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      }));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const search = query.trim().toLowerCase();
  const items =
    state.items?.filter(
      (item) =>
        (!outcome || item.outcome === outcome) &&
        (!search ||
          `${item.package} ${item.reasons.map((r) => r.text).join(" ")}`
            .toLowerCase()
            .includes(search)),
    ) ?? [];
  return (
    <div className="space-y-5">
      <div className="dashboard-toolbar">
        <div>
          <p className="text-sm text-muted">{C.INTRO}</p>
          <p className="mt-2 text-xs text-muted">{E.allocationNote}</p>
        </div>
        <Button onClick={() => void load()} disabled={state.loading}>
          {state.loading ? C.LOADING : C.REFRESH}
        </Button>
      </div>
      <div className="history-toolbar">
        <input
          type="search"
          aria-label={E.decisionSearch}
          placeholder={E.decisionSearch}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={C.COLS.outcome}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        >
          <option value="">{E.all}</option>
          {E.outcomes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {state.items && (
          <span aria-live="polite">
            {fill(E.resultCount, { count: items.length })}
          </span>
        )}
      </div>
      {state.error && (
        <ErrorBox>{fill(C.ERROR, { error: state.error })}</ErrorBox>
      )}
      {state.items?.length === 0 && (
        <div className="product-card text-sm text-muted">{C.EMPTY}</div>
      )}
      {!!state.items?.length && items.length === 0 && (
        <p className="text-sm text-muted">{E.noMatches}</p>
      )}
      <div className="history-list">
        {items.map((item) => (
          <HistoryRow key={item.creditId} item={item} />
        ))}
      </div>
    </div>
  );
}
