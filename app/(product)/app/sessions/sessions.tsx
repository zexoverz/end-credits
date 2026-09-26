"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/product/request";
import { ErrorBox, Button, Badge } from "@/components/ui";
import { DeskAsset } from "@/components/product/desk-assets";
import { Pager } from "@/components/product/pager";
import { WORKSPACE as W } from "@/lib/copy/workspace";
import { SessionOpen } from "@/components/product/session-open";
import { STUDIO as S } from "@/lib/copy/studio";
import { fill } from "@/lib/client/roll";
import type { HistoryItem } from "@/lib/history/history";
export function Sessions({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    const r = await api<{ items: HistoryItem[] }>("/api/history");
    if (r.ok) {
      setError(null);
      setItems(r.data.items);
    } else setError(r.error);
  }, []);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("endcredits:refresh-records", refresh);
    return () =>
      window.removeEventListener("endcredits:refresh-records", refresh);
  }, [load]);
  useEffect(() => {
    let active = true;
    api<{ items: HistoryItem[] }>("/api/history").then((r) => {
      if (!active) return;
      if (r.ok) setItems(r.data.items);
      else setError(r.error);
    });
    return () => {
      active = false;
    };
  }, []);
  const sessions = new Map<string, HistoryItem[]>();
  for (const item of items ?? [])
    sessions.set(item.sessionId, [
      ...(sessions.get(item.sessionId) ?? []),
      item,
    ]);
  const shown = [...sessions].filter(([id, rows]) =>
    `${id} ${rows.map((r) => r.package).join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const pages = Math.ceil(shown.length / 4),
    current = Math.min(page, Math.max(0, pages - 1));
  return (
    <div className="studio-sessions">
      <p className="studio-page-subtitle">{S.sessionsBody}</p>
      {error && (
        <ErrorBox>
          {fill(S.sessionError, { error })}
          <Button onClick={() => void load()}>{S.loadRetry}</Button>
        </ErrorBox>
      )}
      {!items && !error && <p role="status">{S.sessionLoading}</p>}
      {items?.length === 0 && (
        <section className="studio-sessions-empty">
          <DeskAsset kind="session" />
          <div>
            <h2>{S.sessionsEmpty}</h2>
            <p>{S.sessionsEmptyBody}</p>
          </div>
        </section>
      )}
      {!!items?.length && (
        <>
          <input
            type="search"
            aria-label={S.sessionSearch}
            placeholder={S.sessionSearch}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <div className="session-table-head">
            <span>{W.sessionColumn}</span>
            <span>{W.decisionColumn}</span>
          </div>
          <div className="studio-session-list">
            {shown.slice(current * 4, current * 4 + 4).map(([id, rows]) => (
              <article key={id}>
                <Link
                  className="session-row-link"
                  href={`/app/credits/${id}`}
                  aria-label={`${W.credits} ${id}`}
                >
                  <DeskAsset kind="session" compact />
                  <div className="session-row-main">
                    <strong>
                      {id.slice(0, 8)}
                      <span aria-hidden="true"> ↗</span>
                    </strong>
                    <p>
                      {rows
                        .slice(0, 2)
                        .map((r) => r.package)
                        .join(" · ")}
                      {rows.length > 2 && ` +${rows.length - 2}`}
                    </p>
                    <time dateTime={rows[0].decidedAt}>
                      {new Date(rows[0].decidedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <div className="session-decisions">
                    {[...new Set(rows.map((r) => r.outcome))].map((o) => (
                      <Badge key={o} outcome={o} />
                    ))}
                  </div>
                </Link>
              </article>
            ))}
          </div>
          <Pager page={current} pages={pages} onPage={setPage} />
          {shown.length === 0 && <p>{S.sessionNoMatches}</p>}
        </>
      )}
      {!embedded && (
        <div className="studio-session-lookup">
          <h2>{S.openSession}</h2>
          <SessionOpen />
        </div>
      )}
      <p className="studio-scope-note">{S.sessionScope}</p>
    </div>
  );
}
