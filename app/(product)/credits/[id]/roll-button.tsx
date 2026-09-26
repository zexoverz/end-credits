"use client";
// **Roll credits**: POST /api/sessions/:id/settle as the owner (202 / 401 / 403 / 409).
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
    <div className="my-6 flex flex-col items-center gap-2 text-sm">
      <button
        onClick={roll}
        disabled={busy || result?.kind === "requested"}
        className="rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-40"
      >
        {ROLL_COPY.ROLL_BUTTON}
      </button>
      {result && (
        <p
          className={
            result.kind === "requested" ? "text-white/70" : "text-held"
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
