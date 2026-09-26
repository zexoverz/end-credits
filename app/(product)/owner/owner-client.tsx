"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BudgetWallet } from "@/components/budget/budget-wallet";
import { SetApprover } from "@/components/approver/set-approver";
import { useFeedback } from "@/components/product/feedback";
import { CONTROL as U } from "@/lib/copy/control-room";
import { SetupArt } from "@/components/product/setup-art";
import { Button, ErrorBox, Mono, Page } from "@/components/ui";
import { api } from "@/components/product/request";
import { addressUrl, usdc } from "@/lib/client/format";
import type { OwnerSummary, SettingsView } from "@/lib/client/owner";
import type { Onboarding } from "@/lib/owner/onboarding";
import { OWNER_COPY as C } from "@/lib/copy/owner";
import { ONBOARDING as O } from "@/lib/copy/onboarding";
import { AgentKeys } from "./agent-keys";
import { Holds, Notifications } from "./holds";
import { SettingsForm } from "./settings-form";
import { SignIn } from "./sign-in";
import { SetupChecklist } from "./setup-checklist";

type Load =
  | { state: "loading" }
  | { state: "signed_out" }
  | { state: "error"; error: string }
  | { state: "ok"; summary: OwnerSummary };
export function OwnerClient({
  worldCode,
  initialSection = "budget",
}: {
  worldCode: string | null;
  initialSection?: string;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [logoutError, setLogoutError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const refresh = useCallback(async () => {
    const r = await api<OwnerSummary>("/api/owner");
    if (r.ok) setLoad({ state: "ok", summary: r.data });
    else if (r.status === 401) setLoad({ state: "signed_out" });
    else setLoad({ state: "error", error: r.error });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- owner state changes after the API responds
    void refresh();
  }, [refresh]);
  async function logout() {
    setLoggingOut(true);
    setLogoutError(false);
    const r = await api("/api/auth/logout", { method: "POST" });
    if (r.ok) setLoad({ state: "signed_out" });
    else {
      setLogoutError(true);
      await refresh();
    }
    setLoggingOut(false);
  }
  return (
    <Page>
      <div className="owner-setup">
        <header className="owner-setup-heading">
          <div>
            <p className="setup-kicker">{O.eyebrow}</p>
            <h1>
              {O.title.split("\n").map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p>{O.subtitle}</p>
          </div>
          {load.state === "ok" && (
            <div className="owner-session">
              <span>
                {C.SIGNED_IN_AS.replace(
                  "{name}",
                  load.summary.owner.displayName,
                )}
              </span>
              <button disabled={loggingOut} onClick={() => void logout()}>
                {C.LOGOUT} ↗
              </button>
            </div>
          )}
        </header>
        {logoutError && <ErrorBox>{O.signOutFailed}</ErrorBox>}
        {load.state === "loading" && <p role="status">{C.LOADING}</p>}
        {load.state === "error" && (
          <>
            <ErrorBox>{C.LOAD_FAILED.replace("{error}", load.error)}</ErrorBox>
            <Button onClick={() => void refresh()}>{O.retry}</Button>
          </>
        )}
        {load.state === "signed_out" && (
          <section id="identity" className="owner-entry">
            <div className="owner-pass">
              <p className="setup-kicker">{O.passport}</p>
              <SetupArt />
              <h2>{O.passportBody}</h2>
              <span>{O.network}</span>
            </div>
            <SignIn worldCode={worldCode} onSignedIn={refresh} />
          </section>
        )}
        {load.state === "ok" && (
          <SignedIn
            summary={load.summary}
            initialSection={initialSection}
            onSignedOut={() => setLoad({ state: "signed_out" })}
            onRefreshOwner={refresh}
            onSettings={(settings) =>
              setLoad({ state: "ok", summary: { ...load.summary, settings } })
            }
          />
        )}
      </div>
    </Page>
  );
}
function SignedIn({
  summary,
  initialSection,
  onSettings,
  onSignedOut,
  onRefreshOwner,
}: {
  summary: OwnerSummary;
  initialSection: string;
  onSettings: (s: SettingsView) => void;
  onSignedOut: () => void;
  onRefreshOwner: () => void;
}) {
  const [checklist, setChecklist] = useState<Onboarding | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const requestBusy = useRef(false);
  const notify = useFeedback();
  const [copyError, setCopyError] = useState(false);
  async function copyPayer() {
    try {
      await navigator.clipboard.writeText(summary.payer.address);
      setCopyError(false);
      notify(U.copied);
    } catch {
      setCopyError(true);
    }
  }
  const [now, setNow] = useState(() => Date.now());
  const refreshChecklist = useCallback(async () => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setChecking(true);
    const r = await api<Onboarding>("/api/owner/onboarding", {
      cache: "no-store",
    });
    if (r.ok) {
      setChecklist(r.data);
      setCheckError(null);
    } else if (r.status === 401) onSignedOut();
    else {
      setChecklist(null);
      setCheckError(r.error);
    }
    requestBusy.current = false;
    setChecking(false);
  }, [onSignedOut]);
  // Refresh on explicit actions, focus and a visible-page interval; completion always comes from the API.
  const refreshRef = useRef(refreshChecklist);
  useEffect(() => {
    refreshRef.current = refreshChecklist;
  }, [refreshChecklist]);
  useEffect(() => {
    void refreshRef.current();
    const focus = () => {
      if (!document.hidden) void refreshRef.current();
    };
    window.addEventListener("focus", focus);
    const t = setInterval(focus, 30000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("focus", focus);
      clearInterval(t);
      clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    const jump = () => {
      let id = window.location.hash.slice(1);
      if (!id && new URL(window.location.href).searchParams.has("section"))
        id = initialSection === "approvals" ? "approver" : initialSection;
      const el = id ? document.getElementById(id) : null;
      el?.scrollIntoView({ block: "start" });
    };
    const t = setTimeout(jump, 100);
    window.addEventListener("hashchange", jump);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", jump);
    };
  }, [initialSection]);
  const wallet = checklist?.steps.find((s) => s.id === "wallet_bound");
  const allowance = checklist?.steps.find((s) => s.id === "spend_allowance");
  const first = checklist?.steps.find((s) => s.id === "first_session");
  return (
    <>
      <SetupChecklist
        data={checklist}
        error={checkError}
        busy={checking}
        onRefresh={() => void refreshChecklist()}
      />
      <nav className="owner-section-links" aria-label={O.sections}>
        {[
          ["budget", O.budget],
          ["approver", O.approver],
          ["allowance", O.allowance],
          ["keys", O.keys],
          ["holds", O.holds],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
            <span aria-hidden="true">↘</span>
          </a>
        ))}
      </nav>
      <section id="identity" className="owner-bound-identity">
        <div>
          <h2>{O.identity}</h2>
          <p>{O.bound}</p>
          {wallet?.done && wallet.detail ? (
            <Mono>{wallet.detail}</Mono>
          ) : (
            <p>{checkError ? O.unknown : wallet ? O.unbound : O.checking}</p>
          )}
        </div>
        {wallet && !wallet.done && (
          <SignIn
            bindOnly
            onSignedIn={() => {
              void refreshChecklist();
              onRefreshOwner();
            }}
          />
        )}
      </section>
      <section id="budget" className="setup-workstation">
        <header>
          <p className="setup-kicker">{O.budgetLabel}</p>
          <h2>{O.budgetTitle}</h2>
          <p>{O.budgetBody}</p>
        </header>
        <div className="setup-budget-content">
          <SettingsForm
            initial={summary.settings}
            onSaved={(s) => {
              onSettings(s);
              void refreshChecklist();
            }}
          />
          <aside className="setup-funding">
            <p className="setup-kicker">{O.payer}</p>
            <span>{O.balance}</span>
            <strong>
              {summary.payer.error || summary.payer.usdcBalance === null
                ? O.balanceUnknown
                : usdc(summary.payer.usdcBalance)}
            </strong>
            <a
              href={addressUrl(summary.payer.address)}
              target="_blank"
              rel="noreferrer"
            >
              <Mono>{summary.payer.address}</Mono>
            </a>
            <button
              className="owner-text-button"
              onClick={() => void copyPayer()}
            >
              {U.copyAddress}
            </button>
            {copyError && <ErrorBox>{U.copyFailed}</ErrorBox>}
            <p>{O.walletRoles}</p>
            {summary.payer.error && (
              <ErrorBox>
                {C.BALANCE_ERROR.replace("{error}", summary.payer.error)}
              </ErrorBox>
            )}
          </aside>
        </div>
      </section>
      <section id="approver" className="setup-workstation setup-approver">
        <header>
          <p className="setup-kicker">{O.approverLabel}</p>
          <h2>{O.approverTitle}</h2>
          <p>{O.approverBody}</p>
          <SetupArt kind="signature" />
        </header>
        <SetApprover />
      </section>
      <section id="allowance" className="setup-workstation setup-allowance">
        <header>
          <p className="setup-kicker">{O.allowanceLabel}</p>
          <h2>{O.allowanceTitle}</h2>
          <p>{O.allowanceBody}</p>
        </header>
        <div className="allowance-slot">
          <SetupArt kind="allowance" />
          <div>
            <span className="allowance-status">
              {allowance?.done
                ? O.done
                : allowance?.detail === "coming soon"
                  ? O.soon
                  : O.unknown}
            </span>
            {allowance?.detail && (
              <p className="allowance-server-detail">{allowance.detail}</p>
            )}
            <BudgetWallet />
            <a href="#keys">{O.continueKeys}</a>
          </div>
        </div>
      </section>
      <section id="keys" className="setup-workstation setup-agent">
        <header>
          <p className="setup-kicker">{O.keysLabel}</p>
          <h2>{O.keysTitle}</h2>
          <p>{O.keysBody}</p>
        </header>
        <div className="setup-agent-content">
          <div className="setup-terminal">
            <SetupArt kind="agent" />
            <ol>
              <li>
                <span>{O.commandOne}</span>
                <code>{O.keyCommand}</code>
                <p>{O.keyPlaceholder}</p>
              </li>
              <li>
                <span>{O.commandTwo}</span>
                <code>{O.initCommand}</code>
                <p>{O.initHint}</p>
              </li>
            </ol>
            <a href={O.installHref} target="_blank" rel="noreferrer">
              {O.install}
            </a>
          </div>
          <AgentKeys onChanged={() => void refreshChecklist()} />
        </div>
        {first?.done && first.href && (
          <Link className="setup-first-session" href={first.href}>
            {O.recordSession} ↗
          </Link>
        )}
      </section>
      <section id="holds" className="setup-workstation setup-holds">
        <header>
          <p className="setup-kicker">{O.holdsLabel}</p>
          <h2>{O.holdsTitle}</h2>
          <p>{O.holdsBody}</p>
        </header>
        <div className="setup-holds-content">
          <Holds holds={summary.pendingHolds} now={now} />
          <Notifications notifications={summary.notifications} />
        </div>
      </section>
    </>
  );
}
