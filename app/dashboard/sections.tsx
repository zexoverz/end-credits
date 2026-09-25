// The dashboard's sections. Thin on purpose: the redesign restyles these, the view model stays.
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, Mono } from "@/components/ui";
import {
  absoluteTime,
  cardsView,
  money,
  npmHref,
  relativeTime,
  shortHex,
  sortPackages,
  sortRecent,
  subjectLabel,
  type Dashboard,
  type PackageRow,
  type RecentEvent,
} from "@/lib/client/dashboard";
import { addressUrl, txUrl } from "@/lib/client/format";
import { DASHBOARD as C, fill } from "@/lib/copy/dashboard";

const ext = { target: "_blank", rel: "noopener noreferrer", className: "underline" } as const;

function Big({ children }: { children: ReactNode }) {
  return <p className="text-2xl font-semibold tabular-nums">{children}</p>;
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-muted">{children}</p>;
}

function PackageName({ name, fallback }: { name: string | null; fallback: string }) {
  const href = npmHref(name);
  return href ? (
    <Link href={href} className="underline">
      {name}
    </Link>
  ) : (
    <Mono>{shortHex(fallback)}</Mono>
  );
}

export function Cards({ data }: { data: Dashboard }) {
  const v = cardsView(data);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card title={C.CARD_PAID}>
        <Big>{v.paid.amount}</Big>
        <Sub>{v.paid.sub}</Sub>
      </Card>
      <Card title={C.CARD_PROJECTS}>
        <Big>{v.projects.count}</Big>
        <Sub>{v.projects.sub}</Sub>
      </Card>
      <Card title={C.CARD_HELD}>
        <dl className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 text-sm tabular-nums">
          {v.held.map((h) => (
            <div key={h.label} className="contents">
              <dt className="text-muted">{h.label}</dt>
              <dd>{h.count}</dd>
              <dd className="text-right">{h.amount}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title={C.CARD_REFUSED}>
        <Big>{v.refused.count}</Big>
        <Sub>{v.refused.sub}</Sub>
      </Card>
      <Card title={C.CARD_RESERVED}>
        <Big>{v.reserved.amount}</Big>
        <Sub>{v.reserved.sub}</Sub>
        {v.reserved.packages.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {v.reserved.packages.map((p) => (
              <li key={p.key} className="flex justify-between gap-3">
                <PackageName name={p.name} fallback={p.key} />
                <span className="tabular-nums">{p.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function PackageTable({ rows, now }: { rows: PackageRow[]; now: number }) {
  return (
    <Card title={C.PACKAGES}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{C.PACKAGES_EMPTY}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-3">{C.COL_PACKAGE}</th>
                <th className="py-1 pr-3 text-right">{C.COL_SESSIONS}</th>
                <th className="py-1 pr-3 text-right">{C.COL_PAID}</th>
                <th className="py-1 pr-3 text-right">{C.COL_RESERVED}</th>
                <th className="py-1">{C.COL_LAST}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {sortPackages(rows).map((r) => (
                <tr key={r.packageKey} className="border-t border-line">
                  <td className="py-1.5 pr-3">
                    <PackageName name={r.name} fallback={r.packageKey} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">{r.sessions}</td>
                  <td className="py-1.5 pr-3 text-right">{money(r.paid)}</td>
                  <td className="py-1.5 pr-3 text-right">{money(r.reserved)}</td>
                  <td className="py-1.5">
                    {r.lastDecision ? (
                      <span className="flex items-center gap-2" title={absoluteTime(r.lastDecision.at)}>
                        <Badge outcome={r.lastDecision.outcome} />
                        <span className="text-xs text-muted">{relativeTime(r.lastDecision.at, now)}</span>
                      </span>
                    ) : (
                      <span className="text-muted">{C.NO_VALUE}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function RecentEvents({ rows, packages, now }: { rows: RecentEvent[]; packages: PackageRow[]; now: number }) {
  return (
    <Card title={C.RECENT}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{C.RECENT_EMPTY}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-3">{C.COL_EVENT}</th>
                <th className="py-1 pr-3">{C.COL_SUBJECT}</th>
                <th className="py-1 pr-3 text-right">{C.COL_AMOUNT}</th>
                <th className="py-1 pr-3 text-right">{C.COL_BLOCK}</th>
                <th className="py-1 pr-3">{C.COL_TX}</th>
                <th className="py-1">{C.COL_TIME}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {sortRecent(rows).map((r) => {
                const s = subjectLabel(r.subject, packages);
                return (
                  <tr key={`${r.tx}:${r.event}:${r.subject}`} className="border-t border-line">
                    <td className="py-1.5 pr-3 font-medium">{r.event}</td>
                    <td className="py-1.5 pr-3" title={r.subject}>
                      {s.href ? (
                        <Link href={s.href} className="underline">
                          {s.label}
                        </Link>
                      ) : (
                        <Mono>{s.label}</Mono>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{money(r.amount)}</td>
                    <td className="py-1.5 pr-3 text-right">{r.block}</td>
                    <td className="py-1.5 pr-3">
                      <a href={txUrl(r.tx)} {...ext}>
                        <Mono>{shortHex(r.tx)}</Mono>
                      </a>
                    </td>
                    <td className="py-1.5 text-xs text-muted" title={absoluteTime(r.at)}>
                      {relativeTime(r.at, now)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function Footer({ data }: { data: Dashboard }) {
  return (
    <footer className="space-y-1 border-t border-line pt-4 text-xs text-muted">
      <p className="font-medium">{C.FOOTER_SOURCE}</p>
      <p>{fill(C.SESSIONS_SETTLED, { count: data.sessions.count })}</p>
      <p>
        {C.FOOTER_ESCROW}:{" "}
        <a href={addressUrl(data.escrow)} {...ext}>
          <Mono>{data.escrow}</Mono>
        </a>
      </p>
      <p>
        {C.FOOTER_PAYER}:{" "}
        <a href={addressUrl(data.payer)} {...ext}>
          <Mono>{data.payer}</Mono>
        </a>
      </p>
      <p>
        {C.FOOTER_GENERATED}: {absoluteTime(data.generatedAt)}
      </p>
    </footer>
  );
}
