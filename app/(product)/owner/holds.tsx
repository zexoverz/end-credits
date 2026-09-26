"use client";

import Link from "next/link";
import { Card, Mono } from "@/components/ui";
import { countdown } from "@/lib/client/approve";
import { addressUrl, usdc } from "@/lib/client/format";
import { sortHolds, type OwnerSummary, type PendingHold } from "@/lib/client/owner";
import { OWNER_COPY as C } from "@/lib/copy/owner";

const approveHref = (tipId: string) => `/approve/${tipId}`;

function Expiry({ hold, now }: { hold: PendingHold; now: number }) {
  const left = hold.expired ? null : countdown(hold.expiresAt, now);
  return <span className="text-xs text-muted">{left ? C.HOLD_EXPIRES.replace("{time}", left) : C.HOLD_EXPIRED}</span>;
}

export function Holds({ holds, now }: { holds: PendingHold[]; now: number }) {
  return (
    <Card title={C.HOLDS}>
      {holds.length === 0 && <p className="text-sm text-muted">{C.HOLDS_NONE}</p>}
      <ul className="divide-y divide-line">
        {sortHolds(holds).map((h) => (
          <li key={h.tipId} className="flex flex-col gap-1 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {h.package} · {usdc(h.amount)}
              </span>
              <Link href={approveHref(h.tipId)} className="underline">
                {C.HOLD_OPEN}
              </Link>
            </div>
            {h.payee ? (
              <a href={addressUrl(h.payee)} target="_blank" rel="noreferrer" className="underline">
                <Mono>{h.payee}</Mono>
              </a>
            ) : (
              <span className="text-xs text-muted">{C.NO_PAYEE}</span>
            )}
            {h.reason && <span className="text-muted">{h.reason}</span>}
            <Expiry hold={h} now={now} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Notifications({ notifications }: { notifications: OwnerSummary["notifications"] }) {
  return (
    <Card title={`${C.NOTIFICATIONS} · ${C.UNREAD.replace("{count}", String(notifications.unread))}`}>
      {notifications.items.length === 0 && <p className="text-sm text-muted">{C.NOTIFICATIONS_NONE}</p>}
      <ul className="divide-y divide-line text-sm">
        {notifications.items.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{n.kind}</span>{" "}
              <span className="text-xs text-muted">{new Date(n.createdAt).toLocaleString()}</span>
            </span>
            {n.tipId && (
              <Link href={approveHref(n.tipId)} className="underline">
                {C.HOLD_OPEN}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
