// One decided credit: time, package, badge, amount, every reason, the screens, the hold, the tx.
import Link from "next/link";
import { Badge, Mono } from "@/components/ui";
import { txUrl, usdc } from "@/lib/client/format";
import { fill } from "@/lib/client/roll";
import { HISTORY_COPY } from "@/lib/copy/history";
import type { HistoryItem, ScreenView } from "@/lib/history/history";

const time = (iso: string) => new Date(iso).toLocaleString();

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="underline">
      {label}
    </a>
  );
}

function Screen({ s }: { s: ScreenView }) {
  return (
    <li>
      {fill(HISTORY_COPY.SCREEN_LINE, { kind: s.kind, status: s.status, latency: s.latencyMs })}
      {s.screenedAs && <div className="text-muted">{s.screenedAs}</div>}
    </li>
  );
}

function Hold({ hold }: { hold: NonNullable<HistoryItem["hold"]> }) {
  return (
    <div className="space-y-1">
      <div>{fill(HISTORY_COPY.HOLD_LINE, { status: hold.status, expiresAt: time(hold.expiresAt) })}</div>
      {hold.releaseTx && <TxLink hash={hold.releaseTx} label={HISTORY_COPY.RELEASE_TX} />}
      {hold.refundTx && <TxLink hash={hold.refundTx} label={HISTORY_COPY.REFUND_TX} />}
    </div>
  );
}

export function HistoryRow({ item }: { item: HistoryItem }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 pr-3 whitespace-nowrap">{time(item.decidedAt)}</td>
      <td className="py-2 pr-3">
        <div className="font-medium">{item.package}</div>
        {item.payee && <Mono>{item.payee}</Mono>}
        <Link href={`/credits/${item.sessionId}`} className="ml-1 text-xs underline text-muted">
          {HISTORY_COPY.SESSION_LINK}
        </Link>
      </td>
      <td className="py-2 pr-3">
        <Badge outcome={item.outcome} />
        {item.capped && item.outcome !== "capped" && <div className="text-xs text-muted">{HISTORY_COPY.CAPPED}</div>}
      </td>
      <td className="py-2 pr-3 font-mono whitespace-nowrap">{usdc(item.amount)}</td>
      <td className="py-2 pr-3">
        <ul className="space-y-1">
          {item.reasons.map((r, i) => (
            <li key={i}>
              {r.text} <span className="text-xs text-muted">({r.source})</span>
            </li>
          ))}
        </ul>
      </td>
      <td className="py-2 pr-3 text-xs">
        {item.screens.length === 0 ? (
          <span className="text-muted">{HISTORY_COPY.NO_SCREENS}</span>
        ) : (
          <ul className="space-y-1">
            {item.screens.map((s) => (
              <Screen key={s.id} s={s} />
            ))}
          </ul>
        )}
      </td>
      <td className="py-2 pr-3 text-xs">{item.hold && <Hold hold={item.hold} />}</td>
      <td className="py-2 text-xs">{item.txUrl && <a href={item.txUrl} target="_blank" rel="noreferrer" className="underline">{HISTORY_COPY.TX_LINK}</a>}</td>
    </tr>
  );
}
