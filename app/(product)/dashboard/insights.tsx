"use client";
import Link from "next/link";
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
export function ActionQueue({ actions }: { actions: Action[] }) {
  return (
    <section className="action-queue">
      <header>
        <div>
          <p className="control-eyebrow">{C.actions}</p>
          <h2>{actions.length ? C.actionsBody : C.noActions}</h2>
        </div>
        <span className="action-count">{actions.length}</span>
      </header>
      {actions.length === 0 ? (
        <p className="action-empty">{C.noActionsBody}</p>
      ) : (
        <ul>
          {actions.map((a, i) => (
            <li
              key={`${a.kind}-${a.tipId ?? a.packageKey ?? i}`}
              data-kind={a.kind}
            >
              <span className="action-kind">{C.actionKind[a.kind]}</span>
              <div>
                <Link href={a.href}>{a.title}</Link>
                {a.detail && <p>{a.detail}</p>}
                <small>
                  {C.source}: {a.source}
                  {a.expiresAt && (
                    <>
                      {" "}
                      ·{" "}
                      <time dateTime={a.expiresAt}>
                        {new Date(a.expiresAt).toLocaleString()}
                      </time>
                    </>
                  )}
                </small>
              </div>
              <Link className="action-review" href={a.href}>
                {C.review}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export function ActivityTimeline({ buckets }: { buckets: TimelineBucket[] }) {
  const [selected, setSelected] = useState<TimelineSeries>("paid");
  const [index, setIndex] = useState(Math.max(0, buckets.length - 1));
  const values = buckets.map((b) => BigInt(b[selected].micro));
  const max = values.reduce((a, b) => (a > b ? a : b), 0n);
  const current = buckets[Math.min(index, buckets.length - 1)];
  return (
    <section className="activity-timeline">
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
