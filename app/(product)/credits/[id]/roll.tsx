"use client";
import { useState } from "react";
import {
  canRoll,
  fill,
  groupByRole,
  statusLine,
  totals,
  fromMicro,
} from "@/lib/client/roll";
import { EXPERIENCE as E } from "@/lib/copy/experience";
import { ROLL_COPY } from "@/lib/copy/roll";
import { CREDITS_DESK as C } from "@/lib/copy/credits-desk";
import { msg } from "@/lib/messages";
import type { SessionView } from "@/lib/sessions/view";
import { CreditRow } from "./credit-row";
import { RollButton } from "./roll-button";
import { SessionTicket } from "./session-ticket";
import { useSession } from "./use-session";

function Credits({
  view,
  refresh,
}: {
  view: SessionView;
  refresh: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const groups = groupByRole(
    view.credits.filter((c) => filter === "all" || c.outcome === filter),
  );
  const amounts = totals(view.credits);
  const status = view.status === "settled" ? E.completed : statusLine(view);
  const decided = view.credits.filter((c) => c.outcome !== null).length;
  return (
    <div className="credits-desk-grid">
      <SessionTicket view={view} />
      <div className="credits-desk-main">
        <section className="credits-session-status" data-state={view.status}>
          <div>
            <span className="credits-status-dot" aria-hidden="true" />
            <h2>
              {C.state[view.status as keyof typeof C.state] ?? view.status}
            </h2>
          </div>
          {status && <p role="status">{status}</p>}
          {view.status === "settling" && (
            <div className="credits-progress">
              <span>
                {C.progress} · {decided}/{view.credits.length}
              </span>
              <progress
                aria-label={C.progress}
                value={decided}
                max={Math.max(1, view.credits.length)}
              />
            </div>
          )}
          {canRoll(view) && <RollButton id={view.id} onRequested={refresh} />}
        </section>
        {view.status === "settled" && view.credits.length > 0 && (
          <section className="credits-allocation" aria-label={C.allocations}>
            <h2>{C.allocations}</h2>
            <dl>
              {[
                [C.allocated, fromMicro(amounts.paidMicro), C.usdc],
                [C.held, fromMicro(amounts.heldMicro), C.usdc],
                [C.reserved, fromMicro(amounts.reservedMicro), C.usdc],
                [C.refused, amounts.refusedCount, ""],
              ].map(([label, value, unit]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value}
                    <small>{unit}</small>
                  </dd>
                </div>
              ))}
            </dl>
            <p>{C.allocationsNote}</p>
          </section>
        )}
        <div className="cast-heading">
          <h2>{C.cast}</h2>
          <p>{C.castNote}</p>
        </div>
        {view.credits.length > 0 && (
          <div className="cast-filters" role="group" aria-label={C.filters}>
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              {C.all}
              <span>{view.credits.length}</span>
            </button>
            {Object.entries(C.outcomes)
              .filter(([key]) => view.credits.some((c) => c.outcome === key))
              .map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span>
                    {view.credits.filter((c) => c.outcome === key).length}
                  </span>
                </button>
              ))}
          </div>
        )}
        {groups.map((g) => (
          <section className="cast-group" key={g.role}>
            <h3>
              {g.label}
              <span>{g.credits.length.toString().padStart(2, "0")}</span>
            </h3>
            <ul>
              {g.credits.map((c) => (
                <CreditRow key={c.package} credit={c} />
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && (
          <div className="cast-empty">
            <h3>{view.credits.length ? C.noResults : C.emptyTitle}</h3>
            {view.credits.length ? (
              <button
                className="product-button"
                onClick={() => setFilter("all")}
              >
                {C.reset}
              </button>
            ) : (
              <p>{ROLL_COPY.EMPTY}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export function Roll({ id }: { id: string }) {
  const { view, notFound, error, refresh } = useSession(id);
  return (
    <div className="credits-desk">
      <header className="credits-desk-heading">
        <p>{C.eyebrow}</p>
        <h1>{C.title}</h1>
        <span>{C.intro}</span>
      </header>
      {notFound && (
        <div className="cast-empty">
          <h2>{ROLL_COPY.NOT_FOUND}</h2>
        </div>
      )}
      {error && (
        <div role="alert" className="product-error">
          {fill(ROLL_COPY.NETWORK, { error })}
        </div>
      )}
      {!view && !notFound && !error && (
        <div className="cast-empty" role="status">
          <h2>{C.loadingTitle}</h2>
          <p>{ROLL_COPY.LOADING}</p>
        </div>
      )}
      {view && <Credits view={view} refresh={refresh} />}
      <footer className="credits-desk-footer">{msg("NOT_A_PAYWALL")}</footer>
    </div>
  );
}
