"use client";
// Fetches /api/dashboard on load, every 30 s and on Refresh. A failed fetch replaces the numbers
// with the error: nothing on this page is ever a placeholder or a stale guess.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RetainedPanel } from "@/components/product/retained-panel";
import { DESK as D } from "@/lib/copy/desk";
import { ActionQueue, ActivityTimeline } from "./insights";
import { Sessions } from "../app/sessions/sessions";
import { History } from "../history/history";
import { SessionOpen } from "@/components/product/session-open";
import { DeskAsset } from "@/components/product/desk-assets";
import { WORKSPACE as W } from "@/lib/copy/workspace";

import { ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import {
  relativeTime,
  toDashboardError,
  type Dashboard,
  type DashboardError,
} from "@/lib/client/dashboard";
import { DASHBOARD as C, fill } from "@/lib/copy/dashboard";
import {
  Cards,
  Footer,
  PackageTable,
  RecentEvents,
  EscrowPanel,
} from "./sections";

export const REFRESH_MS = 30_000;

type State =
  | { phase: "loading" }
  | { phase: "data"; data: Dashboard; at: number }
  | { phase: "error"; error: DashboardError };

const SessionRecords = memo(Sessions);
const DecisionRecords = memo(History);

export function DashboardView({
  view = "sessions",
  outcome = "",
}: { view?: string; outcome?: string } = {}) {
  const params = useSearchParams();
  const currentView = params?.get("view") ?? view;
  const selected = D.views.some(([key]) => key === currentView)
    ? currentView
    : "sessions";
  const currentOutcome = params?.get("outcome") ?? outcome;
  const [state, setState] = useState<State>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await api<Dashboard>("/api/dashboard", { cache: "no-store" });
      setState(
        r.ok
          ? { phase: "data", data: r.data, at: Date.now() }
          : {
              phase: "error",
              error: toDashboardError(r.status, r.body, r.error),
            },
      );
    } catch (e) {
      setState({
        phase: "error",
        error: toDashboardError(
          0,
          null,
          e instanceof Error ? e.message : String(e),
        ),
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const refresh = setInterval(() => void load(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  return (
    <div className="session-desk">
      <header className="activity-desk-heading">
        <div>
          <p className="desk-eyebrow">{W.live}</p>
          <h1>{W.activityTitle}</h1>
          <p>{W.activityBody}</p>
        </div>
        <div className="activity-heading-art">
          <DeskAsset kind="session" />
          <Link className="desk-outline-button" href="/app/owner">
            {W.controls} ↗
          </Link>
        </div>
      </header>
      <div className="desk-overview-bar">
        <p>{D.scope}</p>
        <div className="studio-sync">
          {state.phase === "data" && (
            <span>
              <i />
              {fill(C.UPDATED, {
                time: relativeTime(new Date(state.at).toISOString(), now),
              })}
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={busy}
            aria-label={busy ? C.REFRESHING : C.REFRESH}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5L4 10m16 4-3 3A7 7 0 0 1 5 12" />
            </svg>
          </button>
        </div>
      </div>
      {state.phase === "loading" && (
        <p role="status" className="desk-loading">
          {C.LOADING}
        </p>
      )}
      {state.phase === "error" && <ErrorPanel error={state.error} />}
      {state.phase === "data" && (
        <>
          <Cards data={state.data} />
        </>
      )}
      <div className="desk-work-area">
        <section className="desk-records" aria-label={D.activity}>
          <nav className="desk-view-nav" aria-label={D.viewsLabel}>
            {D.views.map(([key, label]) => (
              <a
                key={key}
                href={`?view=${key}`}
                onClick={(e) => {
                  if (
                    e.button !== 0 ||
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey
                  )
                    return;
                  e.preventDefault();
                  if (selected === key) return;
                  const url = new URL(window.location.href);
                  url.searchParams.set("view", key);
                  window.history.pushState(null, "", url);
                }}
                aria-current={selected === key ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="desk-record-content">
            <RetainedPanel active={selected === "sessions"}>
              <SessionRecords embedded />
            </RetainedPanel>
            <RetainedPanel active={selected === "decisions"}>
              <DecisionRecords initialOutcome={currentOutcome} />
            </RetainedPanel>
            {selected === "chain" &&
              (state.phase === "data" ? (
                <RecentEvents
                  rows={state.data.recent}
                  packages={state.data.packages}
                  now={now}
                />
              ) : state.phase === "loading" ? (
                <p role="status">{C.LOADING}</p>
              ) : (
                <ErrorPanel error={state.error} />
              ))}
          </div>
          <details className="desk-lookup">
            <summary>
              {D.lookup}
              <span aria-hidden="true">↗</span>
            </summary>
            <SessionOpen />
          </details>
        </section>
        <div className="desk-action-column">
          {state.phase === "data" && (
            <>
              <ActionQueue actions={state.data.actions} />
              <EscrowPanel data={state.data} />
            </>
          )}
        </div>
      </div>
      {state.phase === "data" && (
        <>
          <ActivityTimeline buckets={state.data.timeline ?? []} />
          <details className="desk-cast">
            <summary>
              <span>{D.cast}</span>
              <span>{D.castHint} ↗</span>
            </summary>
            <PackageTable rows={state.data.packages} now={now} />
          </details>
          <Footer data={state.data} />
        </>
      )}
    </div>
  );
}

function ErrorPanel({ error }: { error: DashboardError }) {
  return (
    <ErrorBox>
      <p className="font-medium">{C.ERROR_TITLE}</p>
      <p className="mt-1 font-mono text-xs break-all">
        {error.status > 0 &&
          `${fill(C.ERROR_STATUS, { status: error.status })} · `}
        {error.error}
        {error.kind && ` (${error.kind})`}
        {error.detail && `: ${error.detail}`}
      </p>
    </ErrorBox>
  );
}
