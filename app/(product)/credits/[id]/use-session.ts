"use client";
// Polls GET /api/sessions/:id every second while the session can still change (uploaded, settling).
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { isLive, POLL_MS } from "@/lib/client/roll";
import type { SessionView } from "@/lib/sessions/view";

export interface SessionState {
  view: SessionView | null;
  notFound: boolean;
  error: string | null;
}

export function useSession(id: string): SessionState & { refresh: () => void } {
  const [state, setState] = useState<SessionState>({ view: null, notFound: false, error: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    let next = true;
    try {
      const res = await api<SessionView>(`/api/sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!alive.current) return;
      if (res.ok) {
        setState({ view: res.data, notFound: false, error: null });
        next = isLive(res.data.status);
      } else if (res.status === 404) {
        setState({ view: null, notFound: true, error: null });
        next = false;
      } else {
        setState((s) => ({ ...s, error: res.error }));
      }
    } catch (e) {
      if (!alive.current) return;
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
    }
    if (next && alive.current) timer.current = setTimeout(load, POLL_MS);
  }, [id]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { ...state, refresh: load };
}
