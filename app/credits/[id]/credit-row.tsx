// One credit on the roll: name, main signal, amount, badge, first reason, Basescan link.
import { Badge } from "@/components/ui";
import { txUrl, usdc } from "@/lib/client/format";
import { firstReason, signalLine } from "@/lib/client/roll";
import { ROLL_COPY } from "@/lib/copy/roll";
import type { CreditView } from "@/lib/sessions/view";

export function CreditRow({ credit }: { credit: CreditView }) {
  const signal = signalLine(credit.signal);
  const reason = firstReason(credit.reasons);
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2">
      <div>
        <span className="text-lg font-medium">{credit.package}</span>
        {signal && <span className="ml-3 text-sm text-white/60">{signal}</span>}
      </div>
      <div className="flex items-center gap-3 justify-self-end">
        <span className="font-mono text-sm">{usdc(credit.amount)}</span>
        <Badge outcome={credit.outcome} />
      </div>
      {(reason || credit.txHash) && (
        <div className="col-span-2 text-sm text-white/70">
          {reason}
          {credit.txHash && (
            <a href={txUrl(credit.txHash)} target="_blank" rel="noreferrer" className="ml-2 underline">
              {ROLL_COPY.TX_LINK}
            </a>
          )}
        </div>
      )}
    </li>
  );
}
