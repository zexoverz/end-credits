"use client";

// /approve: the approve button for escrow v2. prepare → the approver wallet signs the release
// (eth_signTypedData_v4) → the server checks and stores the signature → `onSigned(approvalId)`,
// which calls the page's existing approve action (POST /start) with that id.
import Link from "next/link";
import { useState } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import { fill } from "@/lib/client/approve";
import { APPROVER_COPY as C } from "@/lib/copy/approver";
import { connectWallet, errorName, signTypedData, walletKindFor } from "./connect-wallet";

type Prepared = { approvalId: string; approver: string; typedData: unknown };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function SignRelease({
  tipId,
  worldRequired,
  hasApprover,
  disabled,
  busyLabel,
  onSigned,
}: {
  tipId: string;
  worldRequired: boolean;
  hasApprover: boolean;
  disabled: boolean;
  /** The page's own label while its approve action runs; null when idle. */
  busyLabel: string | null;
  onSigned: (approvalId: string) => void;
}) {
  const [step, setStep] = useState<null | "prepare" | "sign">(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasApprover) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>{C.NO_APPROVER}</p>
        <Link href="/app/owner" className="underline">
          {C.NO_APPROVER_LINK}
        </Link>
      </div>
    );
  }

  async function run() {
    setError(null);
    setStep("prepare");
    const base = `/api/approve/${encodeURIComponent(tipId)}`;
    try {
      const p = await api<Prepared>(`${base}/prepare`, { method: "POST" });
      if (!p.ok) throw new Error(p.error);
      const kind = await walletKindFor(p.data.approver);
      const address = await connectWallet(kind);
      if (!address) throw new Error("no account");
      if (!same(address, p.data.approver)) {
        setError(fill(C.WRONG_WALLET, { approver: p.data.approver, address }));
        return;
      }
      setStep("sign");
      const signature = await signTypedData(address, p.data.typedData, kind);
      const s = await api(`${base}/signature`, {
        method: "POST",
        body: JSON.stringify({ approvalId: p.data.approvalId, signature }),
      });
      if (!s.ok) {
        setError(s.error === "bad_signature" ? C.BAD_SIGNATURE : fill(C.SIGN_FAILED, { error: s.error }));
        return;
      }
      onSigned(p.data.approvalId);
    } catch (e) {
      setError(fill(C.SIGN_FAILED, { error: errorName(e) }));
    } finally {
      setStep(null);
    }
  }

  const label = busyLabel ?? (step === "prepare" ? C.PREPARING : step === "sign" ? C.SIGNING : worldRequired ? C.SIGN_WORLD : C.SIGN);
  return (
    <div className="flex flex-col gap-2">
      <Button className="py-3 text-base" disabled={disabled || step !== null} onClick={run}>
        {label}
      </Button>
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
