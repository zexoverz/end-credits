"use client";
// **Roll credits**: POST /api/sessions/:id/settle as the owner (202 / 401 / 403 / 409).
import { ActionNotice } from "@/components/product/feedback";
import { CONTROL as U } from "@/lib/copy/control-room";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/product/request";
import { settleResult, type SettleResult } from "@/lib/client/roll";
import { ROLL_COPY } from "@/lib/copy/roll";

export function RollButton({
  id,
  onRequested,
}: {
  id: string;
  onRequested: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SettleResult | null>(null);

  async function roll() {
    setBusy(true);
    try {
      const res = await api(`/api/sessions/${encodeURIComponent(id)}/settle`, {
        method: "POST",
      });
      const r = settleResult(res.status, res.ok ? "" : res.error);
      setResult(r);
      if (r.kind === "requested" || r.kind === "conflict") onRequested();
    } catch (e) {
      setResult(settleResult(0, e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="credits-roll-action">
      <button
        onClick={roll}
        disabled={busy || result?.kind === "requested"}
        className="product-button"
      >
        {ROLL_COPY.ROLL_BUTTON}
      </button>
      {busy && <ActionNotice tone="pending">{U.working}</ActionNotice>}
      {result && (
        <p
          role="status"
          className={
            result.kind === "requested"
              ? "credits-action-ok"
              : "credits-action-error"
          }
        >
          {result.text}
          {result.kind === "sign_in" && (
            <Link href="/app/owner" className="ml-2 underline">
              {ROLL_COPY.ROLL_SIGN_IN_LINK}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
