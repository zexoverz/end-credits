import Link from "next/link";
import { ReasonEvidence } from "@/components/product/reason-evidence";
import { Badge } from "@/components/ui";
import { txUrl, usdc } from "@/lib/client/format";
import { firstReason, signalLine } from "@/lib/client/roll";
import { CREDITS_DESK as C } from "@/lib/copy/credits-desk";
import type { CreditView } from "@/lib/sessions/view";
export function CreditRow({ credit }: { credit: CreditView }) {
  const signal = signalLine(credit.signal);
  const reason = firstReason(credit.reasons);
  const packagePath = `/app/npm/${credit.package.split("/").map(encodeURIComponent).join("/")}`;
  return (
    <li className="cast-credit" data-outcome={credit.outcome ?? "pending"}>
      <div className="cast-credit-top">
        <span className="cast-package-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path d="m16 4 11 6v12l-11 6-11-6V10Zm0 12v12M5 10l11 6 11-6M10 7l11 6v6" />
          </svg>
        </span>
        <div className="cast-package">
          <Link href={packagePath}>{credit.package}</Link>
          <span>{signal ?? C.pending}</span>
        </div>
        <div className="cast-credit-value">
          <strong>{usdc(credit.amount)}</strong>
          <Badge outcome={credit.outcome} />
        </div>
      </div>
      {reason && <p className="cast-reason-preview">{reason}</p>}
      <div className="cast-credit-links">
        {credit.txHash ? (
          <a href={txUrl(credit.txHash)} target="_blank" rel="noreferrer">
            {C.transaction}
          </a>
        ) : (
          <span>{C.noTransaction}</span>
        )}
        {credit.outcome === "held" && credit.tipId && (
          <Link href={`/app/approve/${encodeURIComponent(credit.tipId)}`}>
            {C.approval}
          </Link>
        )}
        {credit.outcome === "reserved" && (
          <Link href={packagePath}>{C.claim}</Link>
        )}
      </div>
      <details className="cast-evidence">
        <summary>
          {C.details}
          <span aria-hidden="true">+</span>
        </summary>
        <div>
          {Array.isArray(credit.reasons) && credit.reasons.length ? (
            <ReasonEvidence reasons={credit.reasons} />
          ) : (
            <p>{C.noEvidence}</p>
          )}
          {credit.payee && (
            <p className="cast-payee">
              {C.payee}
              <code>{credit.payee}</code>
            </p>
          )}
          <Link href={packagePath}>{C.package}</Link>
        </div>
      </details>
    </li>
  );
}
