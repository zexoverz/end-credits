"use client";

import { useState } from "react";
import { Button, Card, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import { devLoginErrorText, signInFailureText } from "@/lib/client/owner";
import { OWNER_COPY as C } from "@/lib/copy/owner";

export function SignIn({
  worldCode,
  onSignedIn,
}: {
  worldCode: string | null;
  onSignedIn: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worldError = signInFailureText(worldCode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/api/auth/dev", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (!r.ok) {
      setError(devLoginErrorText(r.status, r.body));
      return;
    }
    setToken("");
    onSignedIn();
  }

  return (
    <div className="owner-signin">
      <p>{C.SIGNED_OUT}</p>
      {worldError && <ErrorBox>{worldError}</ErrorBox>}
      <Card>
        {/* A plain link: the start route answers with a redirect to World. */}
        <a
          href="/api/auth/world/start"
          className="inline-block rounded bg-foreground px-3 py-2 text-sm text-background"
        >
          {C.WORLD_SIGN_IN}
        </a>
      </Card>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="text-sm" htmlFor="dev-token">
            {C.DEV_TOKEN}
          </label>
          <input
            id="dev-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="rounded border border-line bg-background px-2 py-1.5 font-mono text-sm"
          />
          <Button type="submit" disabled={busy || token.length === 0}>
            {C.DEV_SIGN_IN}
          </Button>
          {error && <ErrorBox>{error}</ErrorBox>}
        </form>
      </Card>
    </div>
  );
}
