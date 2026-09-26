import Link from "next/link";
import { Badge, Mono } from "@/components/ui";
import { StudioArtwork, PackageGlyph } from "@/components/product/artwork";
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
import { EXPERIENCE as E } from "@/lib/copy/experience";
import { STUDIO as S } from "@/lib/copy/studio";
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
export function Cards({ data }: { data: Dashboard }) {
  const cards = [
    [data.cards.paid.amount.usdc, S.paid, "↗"],
    [data.cards.projects.count, S.projects, "◈"],
    [data.cards.reserved.amount.usdc, S.reserved, "◷"],
    [data.sessions.count, S.sessions, "▤"],
  ];
  return (
    <section className="studio-metrics" aria-label={S.overview}>
      {cards.map(([value, label, icon]) => (
        <div key={label}>
          <div>
            <span>{label}</span>
            <i aria-hidden="true">{icon}</i>
          </div>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}
export function PackageTable({
  rows,
  now,
}: {
  rows: PackageRow[];
  now: number;
}) {
  return (
    <section className="studio-panel">
      <header className="studio-panel-heading">
        <div>
          <h2>{S.packageTitle}</h2>
          <p>{S.packageSubtitle}</p>
        </div>
        <Link href="/app/packages" aria-label={S.browse}>
          ↗
        </Link>
      </header>
      {rows.length === 0 ? (
        <div className="studio-cast-empty">
          <StudioArtwork kind="cast" />
          <h3>{S.packageEmpty}</h3>
          <p>{S.packageEmptyBody}</p>
          <Link href="/app/packages">{S.browse} ↗</Link>
        </div>
      ) : (
        <div className="studio-package-rows">
          {sortPackages(rows).map((row) => (
            <div key={row.packageKey}>
              <PackageGlyph name={row.name ?? row.packageKey} />
              <div>
                <Link
                  href={row.name ? `/app${npmHref(row.name)}` : "/app/packages"}
                >
                  {row.name ?? shortHex(row.packageKey)}
                </Link>
                <small>
                  {row.sessions} {C.COL_SESSIONS.toLowerCase()}
                </small>
              </div>
              <div>
                <strong>{money(row.paid)}</strong>
                <small>
                  {C.COL_RESERVED}: {money(row.reserved)}
                </small>
              </div>
              {row.lastDecision && (
                <span title={absoluteTime(row.lastDecision.at)}>
                  <Badge outcome={row.lastDecision.outcome} />
                  <small>{relativeTime(row.lastDecision.at, now)}</small>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function RecentEvents({
  rows,
  packages,
  now,
}: {
  rows: RecentEvent[];
  packages: PackageRow[];
  now: number;
}) {
  return (
    <section className="studio-panel">
      <header className="studio-panel-heading">
        <div>
          <h2>{S.activity}</h2>
          <p>{S.activitySub}</p>
        </div>
        <span className="studio-live-dot" />
      </header>
      {rows.length === 0 ? (
        <div className="studio-small-empty desk-receipt-empty">
          <StudioArtwork kind="press" />
          <h3>{S.noActivity}</h3>
          <p>{S.noActivityBody}</p>
        </div>
      ) : (
        <ol className="studio-activity">
          {sortRecent(rows).map((row) => {
            const sub = subjectLabel(row.subject, packages);
            return (
              <li key={`${row.tx}:${row.event}:${row.subject}`}>
                <span className="activity-symbol" aria-hidden="true">
                  {row.event === "Released"
                    ? "↗"
                    : row.event === "Held"
                      ? "Ⅱ"
                      : "◈"}
                </span>
                <div>
                  <strong>
                    {S.events[row.event as keyof typeof S.events] ?? row.event}
                  </strong>
                  <p>
                    {sub.href ? (
                      <Link href={`/app${sub.href}`}>{sub.label}</Link>
                    ) : (
                      <Mono>{sub.label}</Mono>
                    )}
                    <span>·</span>
                    <time title={absoluteTime(row.at)}>
                      {relativeTime(row.at, now)}
                    </time>
                  </p>
                </div>
                <div>
                  <strong>{money(row.amount)}</strong>
                  <a
                    href={txUrl(row.tx)}
                    {...ext}
                    aria-label={`${S.transaction} ${shortHex(row.tx)}`}
                  >
                    {S.transaction} ↗
                  </a>
                </div>
                <details>
                  <summary>{fill(S.block, { number: row.block })}</summary>
                  <Mono>{row.tx}</Mono>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
export function EscrowPanel({ data }: { data: Dashboard }) {
  const lines = cardsView(data).held;
  const total = lines.reduce((n, l) => n + l.count, 0);
  const pending = data.cards.held.pending.count;
  return (
    <aside className="studio-side-column">
      <section className={`studio-attention ${pending ? "has-holds" : ""}`}>
        <div className="attention-icon" aria-hidden="true">
          {pending ? "Ⅱ" : "✓"}
        </div>
        <p className="studio-kicker">{S.attention}</p>
        <h2>{pending ? fill(S.held, { count: pending }) : S.clearTitle}</h2>
        <p>{pending ? S.heldBody : S.clearBody}</p>
        {pending > 0 && (
          <Link href="/app/owner?section=approvals">{S.review} ↗</Link>
        )}
      </section>
      <section className="studio-vault">
        <StudioArtwork kind="press" />
        <h2>{S.escrow}</h2>
        <p>{S.escrowBody}</p>
        {total > 0 && (
          <div className="escrow-distribution" aria-hidden="true">
            {lines.map((l, i) => (
              <span
                key={l.label}
                className={`escrow-segment segment-${i}`}
                style={{ flexGrow: l.count }}
              />
            ))}
          </div>
        )}
        <dl>
          {lines.map((l, i) => (
            <div key={l.label}>
              <dt>
                <i className={`segment-${i}`} />
                {[S.pending, S.approved, S.denied, S.expired][i]}
              </dt>
              <dd>
                {l.count}
                <small>{l.amount}</small>
              </dd>
            </div>
          ))}
        </dl>
        <Link href="/app?view=decisions&outcome=refused">
          {fill(S.refused, { count: data.cards.refused.count })} ↗
        </Link>
      </section>
    </aside>
  );
}
export function Footer({ data }: { data: Dashboard }) {
  return (
    <footer className="studio-data-footer">
      <p>
        <i />
        {S.dataNote}
      </p>
      <details>
        <summary>{S.chainDetails}</summary>
        <p>
          {C.FOOTER_SOURCE}. {E.transferScope}
        </p>
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
      </details>
    </footer>
  );
}
