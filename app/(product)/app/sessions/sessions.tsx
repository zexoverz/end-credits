"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/product/request";
import { ErrorBox, Button, Badge } from "@/components/ui";
import { StudioArtwork, PackageGlyph } from "@/components/product/artwork";
import { SessionOpen } from "@/components/product/session-open";
import { STUDIO as S } from "@/lib/copy/studio";
import { fill } from "@/lib/client/roll";
import type { HistoryItem } from "@/lib/history/history";
export function Sessions() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  async function load() {
    const r = await api<{ items: HistoryItem[] }>("/api/history");
    if (r.ok) {
      setError(null);
      setItems(r.data.items);
    } else setError(r.error);
  }
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
          <StudioArtwork />
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
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="studio-session-list">
            {shown.map(([id, rows]) => (
              <article key={id}>
                <div className="session-cast-icons">
                  {rows.slice(0, 3).map((r) => (
                    <PackageGlyph name={r.package} key={r.creditId} />
                  ))}
                </div>
                <div>
                  <Link href={`/app/credits/${id}`}>
                    {id.slice(0, 8)}
                    <span> ↗</span>
                  </Link>
                  <p>
                    {fill(S.sessionCount, { count: rows.length })}
                    <span>·</span>
                    {new Date(rows[0].decidedAt).toLocaleDateString()}
                  </p>
                  <small>
                    {rows
                      .slice(0, 3)
                      .map((r) => r.package)
                      .join(" · ")}
                  </small>
                </div>
                <div className="session-decisions">
                  {[...new Set(rows.map((r) => r.outcome))].map((o) => (
                    <Badge key={o} outcome={o} />
                  ))}
                </div>
                <Link className="session-view-link" href={`/app/credits/${id}`}>
                  {S.sessionCredits} ↗
                </Link>
              </article>
            ))}
          </div>
          {shown.length === 0 && <p>{S.sessionNoMatches}</p>}
        </>
      )}
      <div className="studio-session-lookup">
        <h2>{S.openSession}</h2>
        <SessionOpen />
      </div>
      <p className="studio-scope-note">{S.sessionScope}</p>
    </div>
  );
}
