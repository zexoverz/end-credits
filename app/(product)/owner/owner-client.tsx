"use client";

import { CONTROL as U } from "@/lib/copy/control-room";
import { ControlArt } from "@/components/product/control-art";
import { useFeedback, ExecutionSteps } from "@/components/product/feedback";
import { useCallback, useEffect, useState } from "react";
import { STUDIO as S } from "@/lib/copy/studio";
import { StudioArtwork } from "@/components/product/artwork";
import { SetupGuide } from "@/components/product/setup-guide";
import { SetApprover } from "@/components/approver/set-approver";
import { Button, ErrorBox, Mono, Page } from "@/components/ui";
import { api } from "@/components/product/request";
import { addressUrl, usdc } from "@/lib/client/format";
import type { OwnerSummary, SettingsView } from "@/lib/client/owner";
import { OWNER_COPY as C } from "@/lib/copy/owner";
import { AgentKeys } from "./agent-keys";
import { Holds, Notifications } from "./holds";
import { SettingsForm } from "./settings-form";
import { SignIn } from "./sign-in";

type Load =
  | { state: "loading" }
  | { state: "signed_out" }
  | { state: "error"; error: string }
  | { state: "ok"; summary: OwnerSummary };

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function OwnerClient({
  worldCode,
  initialSection = "budget",
}: {
  worldCode: string | null;
  initialSection?: string;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const refresh = useCallback(async () => {
    const r = await api<OwnerSummary>("/api/owner");
    if (r.ok) setLoad({ state: "ok", summary: r.data });
    else if (r.status === 401) setLoad({ state: "signed_out" });
    else setLoad({ state: "error", error: r.error });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch sets state when it answers
    void refresh();
  }, [refresh]);

  async function logout() {
    const r = await api("/api/auth/logout", { method: "POST" });
    // Ask the server either way: the page is signed out only when the cookie really is gone.
    if (r.ok) setLoad({ state: "signed_out" });
    else await refresh();
  }

  return (
    <Page>
      <header className="control-heading">
        <p className="control-eyebrow">{U.eyebrow}</p>
        <h1>{U.title}</h1>
        <p>{U.subtitle}</p>
      </header>
      {load.state === "loading" && <p className="text-muted">{C.LOADING}</p>}
      {load.state === "error" && (
        <ErrorBox>{C.LOAD_FAILED.replace("{error}", load.error)}</ErrorBox>
      )}
      {load.state === "signed_out" && (
        <div className="studio-auth">
          <div>
            <StudioArtwork kind="agent" />
            <h2>{S.signInTitle}</h2>
            <p>{S.signInBody}</p>
          </div>
          <SignIn worldCode={worldCode} onSignedIn={refresh} />
        </div>
      )}
      {load.state === "ok" && (
        <SignedIn
          key={initialSection}
          initialSection={initialSection}
          summary={load.summary}
          onLogout={logout}
          onSettings={(settings) =>
            setLoad({ state: "ok", summary: { ...load.summary, settings } })
          }
        />
      )}
    </Page>
  );
}

function SignedIn({
  initialSection,
  summary,
  onLogout,
  onSettings,
}: {
  initialSection: string;
  summary: OwnerSummary;
  onLogout: () => void;
  onSettings: (s: SettingsView) => void;
}) {
  const [section, setSection] = useState(
    S.settingsNav.some(([key]) => key === initialSection)
      ? initialSection
      : "budget",
  );
  const now = useNow();
  const { payer, settings } = summary;
  const notify = useFeedback();
  const [copyError, setCopyError] = useState(false);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(payer.address);
      setCopyError(false);
      notify(U.copied);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <div className="control-room">
      <div className="control-identity">
        <span>
          <i />
          {C.SIGNED_IN_AS.replace("{name}", summary.owner.displayName)}
        </span>
        <Button type="button" onClick={onLogout} className="control-logout">
          {C.LOGOUT}
        </Button>
      </div>
      <div className="control-nav" role="group" aria-label={S.settingsBody}>
        {U.tabs.map((tab, i) => (
          <button
            key={tab.id}
            aria-pressed={section === tab.id}
            onClick={() => {
              setSection(tab.id);
              const url = new URL(window.location.href);
              url.searchParams.set("section", tab.id);
              window.history.replaceState(null, "", url);
            }}
          >
            <span className="control-tab-number">0{i + 1}</span>
            <span>
              <strong>
                {tab.title}
                {tab.id === "approvals" && summary.pendingHolds.length > 0 && (
                  <b>{summary.pendingHolds.length}</b>
                )}
              </strong>
              <small>{tab.hint}</small>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <div hidden={section !== "budget"} className="control-budget-grid">
        <SettingsForm initial={settings} onSaved={onSettings} />
        <aside className="control-wallet-column">
          <section className="funding-card">
            <header>
              <p className="control-eyebrow">{U.walletLabel}</p>
              <ControlArt kind="wallet" />
            </header>
            <h2>
              {payer.error || payer.usdcBalance === null
                ? U.walletUnavailable
                : usdc(payer.usdcBalance)}
            </h2>
            <p>{U.walletNote}</p>
            <a
              className="funding-address"
              href={addressUrl(payer.address)}
              target="_blank"
              rel="noreferrer"
            >
              <Mono>{payer.address}</Mono>
            </a>
            <div className="funding-actions">
              <button onClick={copyAddress}>{U.copyAddress}</button>
              <a
                href={addressUrl(payer.address)}
                target="_blank"
                rel="noreferrer"
              >
                {U.viewWallet}
              </a>
            </div>
            {copyError && <ErrorBox>{U.copyFailed}</ErrorBox>}
            {payer.error && (
              <ErrorBox>
                {C.BALANCE_ERROR.replace("{error}", payer.error)}
              </ErrorBox>
            )}
            <p className="funding-note">{U.walletFoot}</p>
          </section>
          <section className="saved-policy">
            <p className="control-eyebrow">{U.savedPolicy}</p>
            <p>{U.savedBody}</p>
            <dl>
              <div>
                <dt>{C.BUDGET}</dt>
                <dd>{usdc(settings.sessionBudget)}</dd>
              </div>
              <div>
                <dt>{C.CAP}</dt>
                <dd>{usdc(settings.packageCap)}</dd>
              </div>
              <div>
                <dt>{C.DAILY}</dt>
                <dd>{usdc(settings.dailyLimit)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
      <div hidden={section !== "keys"} className="control-key-grid">
        <aside className="control-intro-card">
          <ControlArt kind="agent" />
          <h2>{U.keyTitle}</h2>
          <p>{U.keyBody}</p>
          <ExecutionSteps steps={U.keySteps} active={0} />
          <SetupGuide compact />
        </aside>
        <AgentKeys />
      </div>
      <div hidden={section !== "approvals"} className="control-approval-area">
        <header className="control-review-intro">
          <div>
            <p className="control-eyebrow">{U.reviewLabel}</p>
            <h2>{U.reviewTitle}</h2>
            <p>{U.reviewBody}</p>
          </div>
          <ExecutionSteps steps={U.reviewSteps} active={0} />
        </header>
        <div className="control-approval-grid">
          <Holds holds={summary.pendingHolds} now={now} />
          <SetApprover />
        </div>
        <Notifications notifications={summary.notifications} />
      </div>
    </div>
  );
}
