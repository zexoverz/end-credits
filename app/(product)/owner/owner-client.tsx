"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BudgetWallet } from "@/components/budget/budget-wallet";
import { SetApprover } from "@/components/approver/set-approver";
import { useFeedback } from "@/components/product/feedback";
import { CONTROL as U } from "@/lib/copy/control-room";
import { DeskAsset } from "@/components/product/desk-assets";
import { ControlSheet } from "@/components/product/control-sheet";
import { WORKSPACE as W } from "@/lib/copy/workspace";
import { SetupArt } from "@/components/product/setup-art";
import { Button, ErrorBox, Mono, Page } from "@/components/ui";
import { api } from "@/components/product/request";
import { addressUrl, usdc } from "@/lib/client/format";
import type {
  OwnerSummary as BaseOwnerSummary,
  SettingsView,
} from "@/lib/client/owner";
import type { Onboarding } from "@/lib/owner/onboarding";
import { OWNER_COPY as C } from "@/lib/copy/owner";
import { ONBOARDING as O } from "@/lib/copy/onboarding";
import { AgentKeys } from "./agent-keys";
import { LiveHolds, Notifications } from "./holds";
import { SettingsForm } from "./settings-form";
import { SignIn } from "./sign-in";
import { SetupChecklist } from "./setup-checklist";

type OwnerSummary = BaseOwnerSummary & {
  budget?: import("@/lib/owner/budget").BudgetView | null;
};

type Load =
  | { state: "loading" }
  | { state: "signed_out" }
  | { state: "error"; error: string }
  | { state: "ok"; summary: OwnerSummary };
export function OwnerClient({
  initialSignedIn,
  worldCode,
  initialSection = "budget",
}: {
  initialSignedIn: boolean;
  worldCode: string | null;
  initialSection?: string;
}) {
  const [load, setLoad] = useState<Load>({
    state: initialSignedIn ? "loading" : "signed_out",
  });
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
    if (initialSignedIn) void refresh();
  }, [refresh, initialSignedIn]);
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
      <div className="owner-setup owner-desk">
        <header className="owner-setup-heading">
          <div>
            <p className="setup-kicker">{O.eyebrow}</p>
            <h1>{W.ownerTitle}</h1>
            <p>{W.ownerBody}</p>
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
    return () => {
      window.removeEventListener("focus", focus);
      clearInterval(t);
    };
  }, []);
  const [activeControl, setActiveControl] = useState<string | null>(null);
  useEffect(() => {
    const open = () => {
      let id = window.location.hash.slice(1);
      if (!id && new URL(window.location.href).searchParams.has("section"))
        id = initialSection === "approvals" ? "holds" : initialSection;
      setActiveControl(
        [
          "identity",
          "budget",
          "approver",
          "allowance",
          "keys",
          "holds",
          "notifications",
        ].includes(id)
          ? id
          : null,
      );
    };
    const t = setTimeout(open, 0);
    window.addEventListener("hashchange", open);
    window.addEventListener("popstate", open);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", open);
      window.removeEventListener("popstate", open);
    };
  }, [initialSection]);
  function closeControl() {
    setActiveControl(null);
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("section");
    window.history.replaceState(null, "", url);
    if (
      activeControl === "allowance" ||
      activeControl === "approver" ||
      activeControl === "identity"
    ) {
      void refreshChecklist();
      onRefreshOwner();
    }
  }
  const wallet = checklist?.steps.find((s) => s.id === "wallet_bound");
  const allowance = checklist?.steps.find((s) => s.id === "spend_allowance");
  const first = checklist?.steps.find((s) => s.id === "first_session");
  const approver = checklist?.steps.find((s) => s.id === "approver_set");
  return (
    <>
      <SetupChecklist
        data={checklist}
        error={checkError}
        busy={checking}
        onRefresh={() => void refreshChecklist()}
      />
      <div className="owner-desk-grid">
        <a className="owner-tile owner-budget-tile" href="#budget">
          <div className="tile-heading">
            <div>
              <span className="desk-eyebrow">01 / {W.budget}</span>
              <h2>{W.budgetBody}</h2>
            </div>
            <DeskAsset kind="budget" />
          </div>
          <dl className="budget-readout">
            {[
              [W.session, summary.settings.sessionBudget],
              [W.package, summary.settings.packageCap],
              [W.daily, summary.settings.dailyLimit],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {value}
                  <small>{W.unit}</small>
                </dd>
              </div>
            ))}
          </dl>
          <div className="tile-footer">
            <span>{W.editBudget}</span>
            <span aria-hidden="true">↗</span>
          </div>
        </a>
        <a className="owner-tile owner-permission-tile" href="#allowance">
          <div className="tile-heading">
            <div>
              <span className="desk-eyebrow">02 / {W.allowance}</span>
              <h2>{W.allowanceBody}</h2>
            </div>
            <DeskAsset kind="wallet" />
          </div>
          <div className="permission-readout">
            <strong>
              {summary.budget?.error
                ? "—"
                : (summary.budget?.allowance?.remaining ?? "—")}
              <small>{W.unit}</small>
            </strong>
            <div>
              <span>{W.left}</span>
              <p>
                {allowance?.detail ??
                  (checkError ? O.unknown : !checklist ? O.checking : W.notSet)}
              </p>
            </div>
          </div>
          <div className="tile-footer">
            <span>{W.editAllowance}</span>
            <span aria-hidden="true">↗</span>
          </div>
        </a>
        <a className="owner-tile owner-signature-tile" href="#approver">
          <DeskAsset kind="signature" />
          <div>
            <span className="desk-eyebrow">03 / {W.approver}</span>
            <h2>{W.approverBody}</h2>
            <p className="tile-value">
              {approver?.detail ??
                (checkError
                  ? O.unknown
                  : !checklist
                    ? O.checking
                    : approver?.done
                      ? W.configured
                      : W.notSet)}
            </p>
            <span className="tile-link">{W.editApprover} ↗</span>
          </div>
        </a>
        <a className="owner-tile owner-agent-tile" href="#keys">
          <DeskAsset kind="agent" />
          <div>
            <span className="desk-eyebrow">04 / {W.agent}</span>
            <h2>
              {checkError
                ? O.unknown
                : !checklist
                  ? O.checking
                  : checklist.steps.find((s) => s.id === "agent_key")?.done
                    ? W.connected
                    : W.connect}
            </h2>
            <p>{W.agentBody}</p>
            <span className="tile-link">{W.editAgent} ↗</span>
          </div>
        </a>
      </div>
      <div className="owner-desk-bottom">
        <a href="#holds" className="owner-holds-strip">
          <DeskAsset kind="hold" compact />
          <div>
            <h2>
              {W.held} <span>{summary.pendingHolds.length}</span>
            </h2>
            <p>{summary.pendingHolds.length ? W.heldBody : W.noHolds}</p>
          </div>
          <span aria-hidden="true">↗</span>
        </a>
        <div className="owner-desk-meta">
          <a href="#identity">
            {W.identity}
            <span>
              {wallet?.done && wallet.detail
                ? `${wallet.detail.slice(0, 6)}…${wallet.detail.slice(-4)}`
                : O.todo}{" "}
              ↗
            </span>
          </a>
          <a href="#notifications">
            {W.notifications}
            <span>{summary.notifications.unread} ↗</span>
          </a>
        </div>
      </div>
      <ControlSheet
        id="identity"
        title={O.identity}
        open={activeControl === "identity"}
        onClose={closeControl}
      >
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
      </ControlSheet>
      <ControlSheet
        id="budget"
        title={W.budget}
        open={activeControl === "budget"}
        onClose={closeControl}
      >
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
            <details className="setup-funding funding-disclosure">
              <summary>
                <span>{W.serverWallet}</span>
                <strong>
                  {summary.payer.error || summary.payer.usdcBalance === null
                    ? O.balanceUnknown
                    : usdc(summary.payer.usdcBalance)}
                </strong>
                <span aria-hidden="true">+</span>
              </summary>
              <div className="funding-disclosure-body">
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
              </div>
            </details>
          </div>
        </section>
      </ControlSheet>
      <ControlSheet
        id="approver"
        title={W.approver}
        open={activeControl === "approver"}
        onClose={closeControl}
      >
        <section id="approver" className="setup-workstation setup-approver">
          <header>
            <p className="setup-kicker">{O.approverLabel}</p>
            <h2>{O.approverTitle}</h2>
            <p>{O.approverBody}</p>
            <SetupArt kind="signature" />
          </header>
          <SetApprover />
        </section>
      </ControlSheet>
      <ControlSheet
        id="allowance"
        title={W.allowance}
        open={activeControl === "allowance"}
        onClose={closeControl}
      >
        <section id="allowance" className="setup-workstation setup-allowance">
          <header>
            <p className="setup-kicker">{O.allowanceLabel}</p>
            <h2>{O.allowanceTitle}</h2>
            <p>{O.allowanceBody}</p>
            <SetupArt kind="allowance" />
          </header>
          <div className="allowance-slot">
            <div>
              <BudgetWallet />
              <a href="#keys">{O.continueKeys}</a>
            </div>
          </div>
        </section>
      </ControlSheet>
      <ControlSheet
        id="keys"
        title={W.agent}
        open={activeControl === "keys"}
        onClose={closeControl}
      >
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
      </ControlSheet>
      <ControlSheet
        id="holds"
        title={W.held}
        open={activeControl === "holds"}
        onClose={closeControl}
      >
        <section id="holds" className="setup-workstation setup-holds">
          <header>
            <p className="setup-kicker">{O.holdsLabel}</p>
            <h2>{O.holdsTitle}</h2>
            <p>{O.holdsBody}</p>
          </header>
          <div className="setup-holds-content">
            <LiveHolds
              holds={summary.pendingHolds}
              active={activeControl === "holds"}
            />
          </div>
        </section>
      </ControlSheet>
      <ControlSheet
        id="notifications"
        title={W.notifications}
        open={activeControl === "notifications"}
        onClose={closeControl}
      >
        <Notifications notifications={summary.notifications} />
      </ControlSheet>
    </>
  );
}
