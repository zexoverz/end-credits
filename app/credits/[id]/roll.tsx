"use client";
// The film screen (SPEC §12.1): title, rows by role, totals once settled, NOT_A_PAYWALL footer.
import type { ReactNode } from "react";
import { txUrl } from "@/lib/client/format";
import { canRoll, fill, groupByRole, statusLine, totals, totalsLine } from "@/lib/client/roll";
import { ROLL_COPY } from "@/lib/copy/roll";
import { msg } from "@/lib/messages";
import type { SessionView } from "@/lib/sessions/view";
import { CreditRow } from "./credit-row";
import { RollButton } from "./roll-button";
import { useSession } from "./use-session";

function Film({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-film px-4 py-16 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="mb-10 text-center text-lg italic text-white/70">{msg("ROLL_TITLE")}…</p>
        {children}
        <p className="mt-16 text-center text-sm text-white/50">{msg("NOT_A_PAYWALL")}</p>
      </div>
    </div>
  );
}

function Credits({ view, refresh }: { view: SessionView; refresh: () => void }) {
  const groups = groupByRole(view.credits);
  const status = statusLine(view);
  return (
    <>
      {status && <p className="mb-6 text-center text-sm text-white/50">{status}</p>}
      {canRoll(view) && <RollButton id={view.id} onRequested={refresh} />}
      {groups.length === 0 && <p className="text-center text-white/60">{ROLL_COPY.EMPTY}</p>}
      {groups.map((g) => (
        <section key={g.role} className="mb-10">
          <h2 className="mb-2 text-center text-xs uppercase tracking-[0.3em] text-white/50">{g.label}</h2>
          <ul className="divide-y divide-white/10">
            {g.credits.map((c) => (
              <CreditRow key={c.package} credit={c} />
            ))}
          </ul>
        </section>
      ))}
      {view.status === "settled" && groups.length > 0 && (
        <p className="mt-12 text-center text-base">{totalsLine(totals(view.credits))}</p>
      )}
      {view.recordTx && (
        <p className="mt-4 text-center text-xs">
          <a href={txUrl(view.recordTx)} target="_blank" rel="noreferrer" className="underline text-white/60">
            {ROLL_COPY.RECORD_LINK}
          </a>
        </p>
      )}
    </>
  );
}

export function Roll({ id }: { id: string }) {
  const { view, notFound, error, refresh } = useSession(id);
  return (
    <Film>
      {notFound && <p className="text-center text-white/70">{ROLL_COPY.NOT_FOUND}</p>}
      {error && <p className="mb-4 text-center text-sm text-held">{fill(ROLL_COPY.NETWORK, { error })}</p>}
      {!view && !notFound && !error && <p className="text-center text-white/50">{ROLL_COPY.LOADING}</p>}
      {view && <Credits view={view} refresh={refresh} />}
    </Film>
  );
}
