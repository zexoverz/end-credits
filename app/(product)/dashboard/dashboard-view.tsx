"use client";
// Fetches /api/dashboard on load, every 30 s and on Refresh. A failed fetch replaces the numbers
// with the error: nothing on this page is ever a placeholder or a stale guess.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EXPERIENCE as E } from "@/lib/copy/experience";
import { Button, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import {
  relativeTime,
  toDashboardError,
  type Dashboard,
  type DashboardError,
} from "@/lib/client/dashboard";
import { DASHBOARD as C, fill } from "@/lib/copy/dashboard";
import { Cards, Footer, PackageTable, RecentEvents } from "./sections";

export const REFRESH_MS = 30_000;

type State =
  | { phase: "loading" }
  | { phase: "data"; data: Dashboard; at: number }
  | { phase: "error"; error: DashboardError };

export function DashboardView() {
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
    <div className="space-y-6">
      <div className="dashboard-toolbar">
        <p className="text-sm text-muted">
          {C.INTRO} {C.AUTO_REFRESH}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted">
          {state.phase === "data" && (
            <span>
              {fill(C.UPDATED, {
                time: relativeTime(new Date(state.at).toISOString(), now),
              })}
            </span>
          )}
          <Button onClick={() => void load()} disabled={busy}>
            {busy ? C.REFRESHING : C.REFRESH}
          </Button>
        </div>
      </div>

      <div className="dashboard-setup">
        <span aria-hidden="true">✳</span>
        <div>
          <h2>{E.setupBanner}</h2>
          <p>{E.setupBannerBody}</p>
        </div>
        <Link href="/app/owner">{E.setupBannerAction}</Link>
      </div>

      {state.phase === "loading" && (
        <p className="text-sm text-muted">{C.LOADING}</p>
      )}
      {state.phase === "error" && <ErrorPanel error={state.error} />}
      {state.phase === "data" && (
        <>
          <Cards data={state.data} />
          <PackageTable rows={state.data.packages} now={now} />
          <RecentEvents
            rows={state.data.recent}
            packages={state.data.packages}
            now={now}
          />
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
