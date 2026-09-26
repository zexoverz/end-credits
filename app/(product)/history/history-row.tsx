import { PackageGlyph } from "@/components/product/artwork";
import Link from "next/link";
import { Badge, Mono } from "@/components/ui";
import { txUrl, usdc } from "@/lib/client/format";
import { fill } from "@/lib/client/roll";
import { HISTORY_COPY as C } from "@/lib/copy/history";
import { EXPERIENCE as E } from "@/lib/copy/experience";
import type { HistoryItem, ScreenView } from "@/lib/history/history";
const time = (iso: string) => new Date(iso).toLocaleString();
function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      {label}
    </a>
  );
}
function Screen({ s }: { s: ScreenView }) {
  return (
    <li>
      {fill(C.SCREEN_LINE, {
        kind: s.kind,
        status: s.status,
        latency: s.latencyMs,
      })}
      {s.screenedAs && <div className="text-muted">{s.screenedAs}</div>}
      <div className="text-muted">{time(s.fetchedAt)}</div>
    </li>
  );
}
export function HistoryRow({ item }: { item: HistoryItem }) {
  return (
    <article className="decision-card">
      <div className="decision-top">
        <div className="decision-package">
          <PackageGlyph name={item.package} />
          <div>
            <strong>{item.package}</strong>
            <small>{time(item.decidedAt)}</small>
          </div>
        </div>
        <Badge outcome={item.outcome} />
        {item.capped && item.outcome !== "capped" && (
          <span className="text-xs text-muted">{C.CAPPED}</span>
        )}
        <span className="decision-amount">{usdc(item.amount)}</span>
      </div>
      {item.reasons[0] && (
        <p className="decision-reason">{item.reasons[0].text}</p>
      )}
      <div className="decision-links">
        <Link href={`/app/credits/${item.sessionId}`}>{C.SESSION_LINK}</Link>
        {item.txUrl ? (
          <a href={item.txUrl} target="_blank" rel="noreferrer">
            {C.TX_LINK} ↗
          </a>
        ) : (
          <span>{E.noTransfer}</span>
        )}
        {item.payee && <Mono>{item.payee}</Mono>}
      </div>
      <details>
        <summary>{E.decisionDetails}</summary>
        <div className="decision-detail-grid">
          <div>
            <h3>{C.COLS.reasons}</h3>
            <ul>
              {item.reasons.map((r, i) => (
                <li key={i}>
                  {r.text} <code>({r.source})</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>{C.COLS.screens}</h3>
            {item.screens.length === 0 ? (
              <span className="text-muted">{C.NO_SCREENS}</span>
            ) : (
              <ul>
                {item.screens.map((s) => (
                  <Screen key={s.id} s={s} />
                ))}
              </ul>
            )}
          </div>
          {item.hold && (
            <div>
              <h3>{C.COLS.hold}</h3>
              <p>
                {fill(C.HOLD_LINE, {
                  status: item.hold.status,
                  expiresAt: time(item.hold.expiresAt),
                })}
              </p>
              {item.hold.releaseTx && (
                <TxLink hash={item.hold.releaseTx} label={C.RELEASE_TX} />
              )}{" "}
              {item.hold.refundTx && (
                <TxLink hash={item.hold.refundTx} label={C.REFUND_TX} />
              )}
            </div>
          )}
        </div>
      </details>
    </article>
  );
}
