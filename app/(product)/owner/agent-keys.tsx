"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorBox, Mono } from "@/components/ui";
import { api } from "@/components/product/request";
import { keyCommand, type KeyView } from "@/lib/client/owner";
import { OWNER_COPY as C } from "@/lib/copy/owner";

const when = (iso: string) => new Date(iso).toLocaleString();

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Button type="button" onClick={copy} className="shrink-0">
      {copied ? C.COPIED : C.COPY}
    </Button>
  );
}

/** The plaintext token of a key just created. It lives only in this component's state. */
function NewKey({ token, onDone }: { token: string; onDone: () => void }) {
  const command = keyCommand(token);
  return (
    <div className="flex flex-col gap-2 rounded border border-held/50 bg-held/10 p-3 text-sm">
      <p className="font-medium">{C.KEY_CREATED}</p>
      <div className="flex items-center gap-2">
        <Mono>{token}</Mono>
        <CopyButton text={token} />
      </div>
      <p>{C.KEY_COMMAND}</p>
      <div className="flex items-center gap-2">
        <Mono>{command}</Mono>
        <CopyButton text={command} />
      </div>
      <div>
        <Button type="button" onClick={onDone} className="bg-transparent text-foreground ring-1 ring-line">
          {C.KEY_DONE}
        </Button>
      </div>
    </div>
  );
}

export function AgentKeys() {
  const [keys, setKeys] = useState<KeyView[] | null>(null);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: string) => setError(C.KEY_ERR.replace("{error}", e));

  const refresh = useCallback(async () => {
    const r = await api<{ keys: KeyView[] }>("/api/owner/keys");
    if (r.ok) setKeys(r.data.keys);
    else setError(C.KEY_ERR.replace("{error}", r.error));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch sets state when it answers
    void refresh();
  }, [refresh]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setError(C.KEY_LABEL_REQUIRED);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api<KeyView & { token: string }>("/api/owner/keys", {
      method: "POST",
      body: JSON.stringify({ label: label.trim() }),
    });
    setBusy(false);
    if (!r.ok) return fail(r.error);
    setToken(r.data.token);
    setLabel("");
    await refresh();
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    const r = await api(`/api/owner/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return fail(r.error);
    await refresh();
  }

  return (
    <Card title={C.KEYS}>
      <div className="flex flex-col gap-3">
        {token && <NewKey token={token} onDone={() => setToken(null)} />}
        <form onSubmit={create} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="key-label" className="text-sm">
              {C.KEY_LABEL}
            </label>
            <input
              id="key-label"
              maxLength={100}
              placeholder={C.KEY_LABEL_PLACEHOLDER}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded border border-line bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {C.KEY_CREATE}
          </Button>
        </form>
        {error && <ErrorBox>{error}</ErrorBox>}
        {keys && keys.length === 0 && <p className="text-sm text-muted">{C.KEY_NONE}</p>}
        {keys && keys.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className={k.revokedAt ? "text-muted line-through" : ""}>{k.label}</div>
                  <div className="text-xs text-muted">
                    {k.boundVia} ·{" "}
                    {k.revokedAt
                      ? C.KEY_REVOKED.replace("{time}", when(k.revokedAt))
                      : C.KEY_ACTIVE.replace("{time}", when(k.createdAt))}
                  </div>
                </div>
                {!k.revokedAt && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => revoke(k.id)}
                    className="bg-transparent text-refused ring-1 ring-refused/40"
                  >
                    {C.KEY_REVOKE}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
