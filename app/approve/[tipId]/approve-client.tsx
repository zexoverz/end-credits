"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SignRelease } from "@/components/approver/sign-release";
import { Button, Card, ErrorBox, Mono } from "@/components/ui";
import { api } from "@/lib/client/api";
import {
  actionErrorText,
  countdown,
  fill,
  outcomeNotice,
  safeVerifyUrl,
  statusLabel,
  type ApproveView,
  type Notice,
} from "@/lib/client/approve";
import { addressUrl, txUrl, usdc } from "@/lib/client/format";
import { APPROVE_COPY as C } from "@/lib/copy/approve";

type Load = { state: "loading" } | { state: "missing" } | { state: "error"; error: string } | { state: "ok"; view: ApproveView };

type StartResponse = { status: "approved"; releaseTx: string; message: string } | { status: "verify"; url: string };

function NoticeBox({ notice }: { notice: Notice }) {
  if (notice.kind === "error") return <ErrorBox>{notice.text}</ErrorBox>;
  const cls = notice.kind === "ok" ? "border-paid/40 bg-paid/10 text-paid" : "border-line bg-card";
  return <div className={`rounded border px-3 py-2 text-sm ${cls}`}>{notice.text}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function ApproveClient({ tipId, result }: { tipId: string; result: string | null }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<null | "approve" | "deny" | "redirect">(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await api<ApproveView>(`/api/approve/${encodeURIComponent(tipId)}`);
    if (r.ok) setLoad({ state: "ok", view: r.data });
    else if (r.status === 404) setLoad({ state: "missing" });
    else setLoad({ state: "error", error: r.error });
  }, [tipId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch sets state when it answers
    void refresh();
  }, [refresh]);

  const view = load.state === "ok" ? load.view : null;
  const pending = view?.status === "pending";
  const now = useNow(pending);
  const left = view ? countdown(view.expiresAt, now) : null;
  const expiredLocally = pending && left === null;

  // Once the clock passes expiry, ask the server again so the page shows its expired state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch sets state when it answers
    if (expiredLocally) void refresh();
  }, [expiredLocally, refresh]);

  async function approve(v: ApproveView, approvalId: string) {
    setBusy("approve");
    setActionError(null);
    const r = await api<StartResponse>(`/api/approve/${encodeURIComponent(tipId)}/start`, {
      method: "POST",
      body: JSON.stringify({ approvalId }),
    });
    if (!r.ok) {
      setActionError(actionErrorText("approve", r.status, r.body, v));
      setBusy(null);
      await refresh();
      return;
    }
    if (r.data.status === "verify") {
      const url = safeVerifyUrl(r.data.url);
      if (!url) {
        setActionError(fill(C.ERR_OTHER, { error: "bad_verify_url" }));
        setBusy(null);
        return;
      }
      setBusy("redirect");
      window.location.assign(url);
      return;
    }
    setBusy(null);
    await refresh();
  }

  async function deny(v: ApproveView) {
    setBusy("deny");
    setActionError(null);
    const r = await api(`/api/approve/${encodeURIComponent(tipId)}/deny`, { method: "POST" });
    if (!r.ok) setActionError(actionErrorText("deny", r.status, r.body, v));
    setBusy(null);
    await refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">{C.TITLE}</h1>
      {load.state === "loading" && <p className="text-muted">{C.LOADING}</p>}
      {load.state === "missing" && <ErrorBox>{C.NOT_FOUND}</ErrorBox>}
      {load.state === "error" && <ErrorBox>{fill(C.LOAD_FAILED, { error: load.error })}</ErrorBox>}
      {view && (
        <div className="flex flex-col gap-4">
          <p className="text-2xl font-semibold leading-snug break-words">{view.sentence}</p>

          <Card>
            <Row label={C.PACKAGE}>{view.package}</Row>
            <Row label={C.AMOUNT}>{usdc(view.amount)}</Row>
            <Row label={C.PAYEE}>
              {view.payee ? (
                <a href={addressUrl(view.payee)} target="_blank" rel="noreferrer" className="underline">
                  <Mono>{view.payee}</Mono>
                </a>
              ) : (
                <span className="text-muted">{C.NO_PAYEE}</span>
              )}
            </Row>
            {view.reason && <Row label={C.REASON}>{view.reason}</Row>}
            <Row label={C.STATUS}>
              {statusLabel(view.status)}
              {pending && left && <span className="text-muted"> · {fill(C.EXPIRES_IN, { time: left })}</span>}
            </Row>
            {view.txHash && (
              <Row label={view.status === "approved" ? C.RELEASE_TX : C.REFUND_TX}>
                <a href={txUrl(view.txHash)} target="_blank" rel="noreferrer" className="underline">
                  <Mono>{view.txHash}</Mono>
                </a>
              </Row>
            )}
          </Card>

          {/* The action's own error already says what the server recorded as the last failure. */}
          {(!actionError || !pending) && <Outcome view={view} result={result} />}
          {actionError && <ErrorBox>{actionError}</ErrorBox>}

          {pending && !expiredLocally && <Actions view={view} busy={busy} onApprove={approve} onDeny={deny} />}
        </div>
      )}
    </div>
  );
}

function Outcome({ view, result }: { view: ApproveView; result: string | null }) {
  const notice = outcomeNotice(view, result);
  if (!notice) return null;
  const prefixed =
    notice.kind === "error" && view.failureCode ? { ...notice, text: `${C.LAST_ATTEMPT} ${notice.text}` } : notice;
  return <NoticeBox notice={prefixed} />;
}

function Actions({
  view,
  busy,
  onApprove,
  onDeny,
}: {
  view: ApproveView;
  busy: null | "approve" | "deny" | "redirect";
  onApprove: (v: ApproveView, approvalId: string) => void;
  onDeny: (v: ApproveView) => void;
}) {
  if (!view.signedIn) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>{C.SIGN_IN}</p>
        <Link href="/owner" className="underline">
          {C.SIGN_IN_LINK}
        </Link>
      </div>
    );
  }
  if (!view.isOwner) return <ErrorBox>{C.NOT_OWNER}</ErrorBox>;
  const label = busy === "redirect" ? C.REDIRECTING : busy === "approve" ? C.WORKING : null;
  return (
    <div className="flex flex-col gap-3">
      <SignRelease
        tipId={view.tipId}
        worldRequired={view.worldRequired}
        hasApprover={view.hasApprover}
        disabled={busy !== null}
        busyLabel={label}
        onSigned={(approvalId) => onApprove(view, approvalId)}
      />
      <Button
        className="bg-transparent py-3 text-base text-foreground ring-1 ring-line"
        disabled={busy !== null}
        onClick={() => onDeny(view)}
      >
        {busy === "deny" ? C.WORKING : C.DENY}
      </Button>
    </div>
  );
}
