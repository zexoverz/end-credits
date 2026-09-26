"use client";

// /approve: the approve button for escrow v2. prepare → the approver wallet signs the release
// (eth_signTypedData_v4) → the server checks and stores the signature → `onSigned(approvalId)`,
// which calls the page's existing approve action (POST /start) with that id.
import { ActionNotice, ExecutionSteps } from "@/components/product/feedback";
import { CONTROL as U } from "@/lib/copy/control-room";
import Link from "next/link";
import { useState } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import { fill } from "@/lib/client/approve";
import { APPROVER_COPY as C } from "@/lib/copy/approver";
import {
  connectWallet,
  errorName,
  signTypedData,
  walletKindFor,
} from "./connect-wallet";

type Prepared = { approvalId: string; approver: string; typedData: unknown };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function SignRelease({
  tipId,
  worldRequired,
  hasApprover,
  disabled,
  busyLabel,
  onSigned,
  onBusyChange,
}: {
  tipId: string;
  worldRequired: boolean;
  hasApprover: boolean;
  disabled: boolean;
  /** The page's own label while its approve action runs; null when idle. */
  busyLabel: string | null;
  onSigned: (approvalId: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [step, setStep] = useState<
    null | "prepare" | "wallet" | "sign" | "submit"
  >(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasApprover) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>{C.NO_APPROVER}</p>
        <Link href="/app/owner?section=approvals" className="underline">
          {C.NO_APPROVER_LINK}
        </Link>
      </div>
    );
  }

  async function run() {
    if (disabled || step !== null) return;
    onBusyChange?.(true);
    setError(null);
    setStep("prepare");
    const base = `/api/approve/${encodeURIComponent(tipId)}`;
    try {
      const p = await api<Prepared>(`${base}/prepare`, { method: "POST" });
      if (!p.ok) throw new Error(p.error);
      setStep("wallet");
      const kind = await walletKindFor(p.data.approver);
      const address = await connectWallet(kind);
      if (!address) throw new Error("no account");
      if (!same(address, p.data.approver)) {
        setError(fill(C.WRONG_WALLET, { approver: p.data.approver, address }));
        return;
      }
      setStep("sign");
      const signature = await signTypedData(address, p.data.typedData, kind);
      setStep("submit");
      const s = await api(`${base}/signature`, {
        method: "POST",
        body: JSON.stringify({ approvalId: p.data.approvalId, signature }),
      });
      if (!s.ok) {
        setError(
          s.error === "bad_signature"
            ? C.BAD_SIGNATURE
            : fill(C.SIGN_FAILED, { error: s.error }),
        );
        return;
      }
      onSigned(p.data.approvalId);
    } catch (e) {
      setError(fill(C.SIGN_FAILED, { error: errorName(e) }));
    } finally {
      setStep(null);
      onBusyChange?.(false);
    }
  }

  const label =
    busyLabel ??
    (step === "prepare"
      ? C.PREPARING
      : step === "wallet"
        ? C.CONNECTING
        : step === "submit"
          ? U.submit
          : step === "sign"
            ? C.SIGNING
            : worldRequired
              ? C.SIGN_WORLD
              : C.SIGN);
  return (
    <div className="release-execution" aria-busy={step !== null || !!busyLabel}>
      {(step || busyLabel) && (
        <>
          <ExecutionSteps
            steps={[U.prepare, U.wallet, U.sign, U.submit, U.execute]}
            active={
              busyLabel
                ? 4
                : step === "prepare"
                  ? 0
                  : step === "wallet"
                    ? 1
                    : step === "sign"
                      ? 2
                      : 3
            }
          />
          <ActionNotice tone="pending">
            {busyLabel
              ? U.executeHint
              : step === "submit"
                ? U.submitHint
                : step === "prepare"
                  ? C.PREPARING
                  : U.signHint}
          </ActionNotice>
        </>
      )}
      <Button
        className="py-3 text-base"
        disabled={disabled || step !== null}
        onClick={run}
      >
        {label}
      </Button>
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
