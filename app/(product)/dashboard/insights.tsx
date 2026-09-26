"use client";
import Link from "next/link";
import { DeskAsset, PackageMark } from "@/components/product/desk-assets";
import { Pager } from "@/components/product/pager";
import { inboxItems } from "@/components/product/action-inbox";
import { WORKSPACE as W } from "@/lib/copy/workspace";
import { useState, type CSSProperties } from "react";
import type {
  Action,
  TimelineBucket,
  TimelineSeries,
} from "@/lib/multibaas/actions";
import { INSIGHTS as C } from "@/lib/copy/control-room";
const series: TimelineSeries[] = [
  "paid",
  "held",
  "released",
  "refunded",
  "reserved",
  "claimed",
];
const hour = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export function ActionQueue({ actions }: { actions?: Action[] }) {
  const [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0);
  const grouped = inboxItems(actions ?? []);
  const holds = grouped.filter(
    (x) => x.action.kind !== "reserve_waiting",
  ).length;
  const visible = grouped.filter(
    (x) =>
      filter === "all" ||
      (filter === "claim") === (x.action.kind === "reserve_waiting"),
  );
  const pages = Math.ceil(visible.length / 3),
    current = Math.min(page, Math.max(0, pages - 1));
  return (
    <section id="actions" className="action-inbox" aria-label={W.inbox}>
      <header>
        <div>
          <span className="desk-eyebrow">{W.inbox}</span>
          <h2>{W.inboxBody}</h2>
        </div>
        <DeskAsset kind="hold" compact />
      </header>
      {!actions ? (
        <p className="inbox-empty">{C.actionsUnavailable}</p>
      ) : (
        <>
          <div className="inbox-filters" role="group" aria-label={W.inbox}>
            {[
              ["all", W.all, grouped.length],
              ["sign", W.sign, holds],
              ["claim", W.claim, grouped.length - holds],
            ].map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => {
                  setFilter(String(id));
                  setPage(0);
                }}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <div className="inbox-empty">
              <h3>{W.noActions}</h3>
              <p>{W.noActionsBody}</p>
            </div>
          ) : (
            <ul>
              {visible
                .slice(current * 3, current * 3 + 3)
                .map(({ action: a, warning }, i) => (
                  <li
                    key={`${a.kind}-${a.tipId ?? a.packageKey ?? i}`}
                    data-kind={a.kind}
                  >
                    <div className="inbox-item-heading">
                      <PackageMark name={a.package ?? ""} />
                      <div>
                        <Link href={a.href}>
                          {a.package ??
                            (a.kind === "reserve_waiting"
                              ? W.unknownPackage
                              : W.unknownTip)}
                        </Link>
                        <span>
                          {warning ? W.expiring : C.actionKind[a.kind]}
                        </span>
                      </div>
                      <strong>
                        {a.amount.usdc}
                        <small>{W.unit}</small>
                      </strong>
                    </div>
                    <div className="inbox-item-footer">
                      <details>
                        <summary>{W.evidence}</summary>
                        {warning && warning !== a && <p>{warning.title}</p>}
                        <p>{a.title}</p>
                        {a.detail && <p>{a.detail}</p>}
                        <small>
                          {W.source}: {a.source}
                          {a.expiresAt && (
                            <>
                              {" "}
                              · {W.expires}{" "}
                              <time dateTime={a.expiresAt}>
                                {new Date(a.expiresAt).toLocaleString()}
                              </time>
                            </>
                          )}
                        </small>
                      </details>
                      <Link href={a.href}>
                        {a.kind === "reserve_waiting"
                          ? a.package
                            ? C.claimReserve
                            : C.findPackage
                          : C.reviewHold}
                      </Link>
                    </div>
                  </li>
                ))}
            </ul>
          )}
          <Pager page={current} pages={pages} onPage={setPage} />
        </>
      )}
    </section>
  );
}
export function ActivityTimeline({ buckets }: { buckets: TimelineBucket[] }) {
  const [selected, setSelected] = useState<TimelineSeries>(
    () =>
      series.find((k) => buckets.some((b) => BigInt(b[k].micro) > 0n)) ??
      "paid",
  );
  const [index, setIndex] = useState(Math.max(0, buckets.length - 1));
  const values = buckets.map((b) => BigInt(b[selected].micro));
  const max = values.reduce((a, b) => (a > b ? a : b), 0n);
  const current = buckets[Math.min(index, buckets.length - 1)];
  return (
    <section id="timeline" className="activity-timeline">
      <header>
        <div>
          <p className="control-eyebrow">{C.timelineLabel}</p>
          <h2>{C.timeline}</h2>
          <p>{C.timelineBody}</p>
        </div>
        {current && (
          <div className="timeline-inspect">
            <strong>
              {current[selected].usdc}
              <small>{C.unit}</small>
            </strong>
            <span>{hour(current.hour)} UTC</span>
          </div>
        )}
      </header>
      <div className="timeline-series" role="group" aria-label={C.timeline}>
        {series.map((k) => (
          <button
            key={k}
            onClick={() => setSelected(k)}
            aria-pressed={selected === k}
            data-series={k}
          >
            <i />
            {C.series[k]}
          </button>
        ))}
      </div>
      {buckets.length ? (
        <>
          <div
            className="timeline-chart"
            role="group"
            aria-label={C.chartLabel}
          >
            {buckets.map((b, i) => (
              <button
                key={b.hour}
                tabIndex={i === index ? 0 : -1}
                onFocus={() => setIndex(i)}
                onMouseEnter={() => setIndex(i)}
                onClick={() => setIndex(i)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const next = Math.max(
                    0,
                    Math.min(
                      buckets.length - 1,
                      i + (e.key === "ArrowRight" ? 1 : -1),
                    ),
                  );
                  setIndex(next);
                  (
                    e.currentTarget.parentElement?.children[
                      next
                    ] as HTMLButtonElement
                  )?.focus();
                }}
                aria-label={`${hour(b.hour)} UTC · ${C.series[selected]} ${b[selected].usdc} ${C.unit}`}
                aria-pressed={index === i}
                data-series={selected}
                data-zero={values[i] === 0n}
                style={
                  {
                    "--bar": `${max > 0n ? Number((values[i] * 10000n) / max) / 100 : 0}%`,
                  } as CSSProperties
                }
              >
                <span />
              </button>
            ))}
          </div>
          <div className="timeline-axis">
            <span>{hour(buckets[0].hour)}</span>
            <span>{C.currentHour}</span>
          </div>
          {max === 0n && <p className="timeline-empty">{C.noEvents}</p>}
          <details className="timeline-data">
            <summary>{C.table}</summary>
            <div tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>{C.hour}</th>
                    {series.map((k) => (
                      <th key={k}>
                        {C.series[k]} ({C.unit})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.hour}>
                      <th>{hour(b.hour)}</th>
                      {series.map((k) => (
                        <td key={k}>{b[k].usdc}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p>{C.missingTimeline}</p>
      )}
    </section>
  );
}
