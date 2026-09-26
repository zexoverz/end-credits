"use client";

// /owner: the approver wallet as stored, as in force on chain, and any pending change with the time
// it takes over (a change is timelocked on chain; shown, never hidden). Connect a wallet and name it.
import { useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorBox, Mono } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fill } from "@/lib/client/approve";
import { APPROVER_COPY as C } from "@/lib/copy/approver";
import { ConnectWallet } from "./connect-wallet";

export interface ApproverView {
  approver: string | null;
  onchain: string | null;
  pending: { address: string; activeAt: string } | null;
}

const addr = (a: string | null) => (a ? <Mono>{a}</Mono> : <span className="text-muted">{C.NONE}</span>);

export function SetApprover() {
  const [view, setView] = useState<ApproverView | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const r = await api<ApproverView>("/api/owner/approver");
    if (r.ok) setView(r.data);
    else setNote({ kind: "error", text: fill(C.LOAD_FAILED, { error: r.error }) });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch sets state when it answers
    void refresh();
  }, [refresh]);

  async function setApprover() {
    if (!wallet) return;
    setBusy(true);
    setNote(null);
    const r = await api<ApproverView>("/api/owner/approver", {
      method: "POST",
      body: JSON.stringify({ address: wallet }),
    });
    setBusy(false);
    if (r.ok) {
      setView(r.data);
      setNote({ kind: "ok", text: C.SET_DONE });
      return;
    }
    const code = (r.body as { error?: string; code?: string } | null) ?? {};
    const text = code.error === "payer_mismatch" ? C.PAYER_MISMATCH : fill(C.SET_FAILED, { error: code.code ?? r.error });
    setNote({ kind: "error", text });
  }

  return (
    <Card title={C.TITLE}>
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted">{C.EXPLAIN}</p>
        {view && (
          <>
            <div>
              {C.STORED}: {addr(view.approver)}
            </div>
            <div>
              {C.ONCHAIN}: {addr(view.onchain)}
            </div>
            {view.pending && (
              <div>
                <Mono>{view.pending.address}</Mono>{" "}
                {fill(C.PENDING, { time: new Date(view.pending.activeAt).toLocaleString() })}
                <p className="text-muted">{C.PENDING_NOTE}</p>
              </div>
            )}
          </>
        )}
        <ConnectWallet onConnected={setWallet} />
        {wallet && (
          <Button type="button" disabled={busy} onClick={setApprover}>
            {busy ? C.SETTING : C.SET}
          </Button>
        )}
        {note?.kind === "error" && <ErrorBox>{note.text}</ErrorBox>}
        {note?.kind === "ok" && <p>{note.text}</p>}
      </div>
    </Card>
  );
}
