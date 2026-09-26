import { Badge } from "@/components/ui";
import { txUrl, usdc } from "@/lib/client/format";
import { firstReason, signalLine } from "@/lib/client/roll";
import { ROLL_COPY } from "@/lib/copy/roll";
import { EXPERIENCE as E } from "@/lib/copy/experience";
import type { CreditView } from "@/lib/sessions/view";
export function CreditRow({ credit }: { credit: CreditView }) {
  const signal = signalLine(credit.signal);
  const reasons = Array.isArray(credit.reasons)
    ? credit.reasons
        .map((r) => firstReason([r]))
        .filter((r): r is string => !!r)
    : [];
  return (
    <li className="credit-row">
      <div>
        <span className="credit-package">{credit.package}</span>
        {signal && <span className="credit-signal">{signal}</span>}
      </div>
      <div className="credit-money">
        <span>{usdc(credit.amount)}</span>
        <Badge outcome={credit.outcome} />
      </div>
      <div className="credit-reasons">
        {reasons[0]}
        {reasons.length > 1 && (
          <details>
            <summary>{E.reason}</summary>
            <ul>
              {reasons.slice(1).map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </details>
        )}
        {credit.txHash ? (
          <a href={txUrl(credit.txHash)} target="_blank" rel="noreferrer">
            {ROLL_COPY.TX_LINK} ↗
          </a>
        ) : (
          credit.outcome && <span className="credit-no-tx">{E.noTransfer}</span>
        )}
      </div>
    </li>
  );
}
