"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { api } from "@/components/product/request";
import { ActionNotice } from "@/components/product/feedback";
import {
  hasInjectedWallet,
  type WalletKind,
} from "@/components/approver/connect-wallet";
import { devLoginErrorText, signInFailureText } from "@/lib/client/owner";
import { OWNER_COPY as C } from "@/lib/copy/owner";
import { ONBOARDING as O } from "@/lib/copy/onboarding";
import {
  signInWithWallet,
  walletSignInError,
  type SignInStage,
} from "./wallet-sign-in";

type Methods = { wallet: boolean; dev: boolean; world: boolean };
export function SignIn({
  worldCode = null,
  onSignedIn,
  bindOnly = false,
}: {
  worldCode?: string | null;
  onSignedIn: () => void;
  bindOnly?: boolean;
}) {
  const [methods, setMethods] = useState<Methods | null>(null);
  const [methodsError, setMethodsError] = useState(false);
  const [token, setToken] = useState("");
  const [stage, setStage] = useState<SignInStage | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const attempt = useRef(0);
  const busyRef = useRef(false);
  const [browserWallet, setBrowserWallet] = useState(false);
  const loadMethods = useCallback(async () => {
    setMethodsError(false);
    const r = await api<Methods>("/api/auth/methods", { cache: "no-store" });
    if (r.ok) setMethods(r.data);
    else setMethodsError(true);
    setBrowserWallet(hasInjectedWallet());
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void loadMethods(), 0);
    return () => {
      clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate the latest request, not the initial generation
      attempt.current++;
    };
  }, [loadMethods]);
  const busy = stage !== null || devBusy;
  async function wallet(kind: WalletKind) {
    if (busyRef.current) return;
    busyRef.current = true;
    const id = ++attempt.current;
    setError(null);
    setCancelled(false);
    try {
      const ok = await signInWithWallet(
        kind,
        setStage,
        () => id === attempt.current,
      );
      if (ok) onSignedIn();
    } catch (e) {
      if (id === attempt.current) setError(walletSignInError(e));
    } finally {
      if (id === attempt.current) {
        busyRef.current = false;
        setStage(null);
      }
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setDevBusy(true);
    setError(null);
    setCancelled(false);
    const r = await api("/api/auth/dev", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    busyRef.current = false;
    setDevBusy(false);
    if (!r.ok) {
      setError(devLoginErrorText(r.status, r.body));
      return;
    }
    setToken("");
    onSignedIn();
  }
  return (
    <div className="owner-wallet-signin">
      <h2>{O.signInTitle}</h2>
      <p>{O.signInBody}</p>
      {signInFailureText(worldCode) && (
        <ErrorBox>{signInFailureText(worldCode)}</ErrorBox>
      )}
      {!methods && !methodsError && <p role="status">{O.methodsLoading}</p>}
      {methodsError && (
        <>
          <ErrorBox>{O.methodsError}</ErrorBox>
          <Button onClick={() => void loadMethods()}>{O.retry}</Button>
        </>
      )}
      {methods?.wallet && (
        <div className="owner-wallet-options">
          <button
            className="wallet-choice"
            disabled={busy}
            onClick={() => {
              if (!hasInjectedWallet()) {
                setError(O.noExtension);
                return;
              }
              void wallet("injected");
            }}
          >
            <span className="wallet-choice-icon" aria-hidden="true">
              ↗
            </span>
            <span>
              <strong>{O.metamask}</strong>
              <small>
                {O.metamaskHint}
                {!browserWallet ? " · " + O.noExtension.split(".")[0] : ""}
              </small>
            </span>
            <b aria-hidden="true">→</b>
          </button>
          <button
            className="wallet-choice"
            disabled={busy}
            onClick={() => void wallet("base")}
          >
            <span
              className="wallet-choice-icon base-account-icon"
              aria-hidden="true"
            >
              ●
            </span>
            <span>
              <strong>{O.passkey}</strong>
              <small>{O.passkeyHint}</small>
            </span>
            <b aria-hidden="true">→</b>
          </button>
        </div>
      )}
      {methods && !methods.wallet && <p>{O.unavailable}</p>}
      <p className="owner-signature-note">{O.messageOnly}</p>
      {stage && <ActionNotice tone="pending">{O.stages[stage]}</ActionNotice>}
      {stage && stage !== "verify" && (
        <button
          className="owner-text-button"
          onClick={() => {
            attempt.current++;
            busyRef.current = false;
            setStage(null);
            setCancelled(true);
          }}
        >
          {O.cancel}
        </button>
      )}
      {cancelled && <ActionNotice tone="info">{O.cancelled}</ActionNotice>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {!bindOnly && methods?.dev && (
        <details className="owner-dev-access">
          <summary>{O.dev}</summary>
          <form onSubmit={submit}>
            <label htmlFor="dev-token">{C.DEV_TOKEN}</label>
            <input
              id="dev-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button type="submit" disabled={busy || !token}>
              {C.DEV_SIGN_IN}
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
