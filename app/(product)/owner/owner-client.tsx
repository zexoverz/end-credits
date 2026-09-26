"use client";

import { useCallback, useEffect, useState } from "react";
import { STUDIO as S } from "@/lib/copy/studio";
import { StudioArtwork } from "@/components/product/artwork";
import { SetupGuide } from "@/components/product/setup-guide";
import { SetApprover } from "@/components/approver/set-approver";
import { Button, Card, ErrorBox, Mono, Page } from "@/components/ui";
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
    <Page title={S.settingsTitle}>
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
  const { payer } = summary;
  return (
    <div className="studio-settings">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          {C.SIGNED_IN_AS.replace("{name}", summary.owner.displayName)}
        </span>
        <Button
          type="button"
          onClick={onLogout}
          className="bg-transparent text-foreground ring-1 ring-line"
        >
          {C.LOGOUT}
        </Button>
      </div>

      <div
        className="studio-settings-tabs"
        role="group"
        aria-label={S.settingsBody}
      >
        {S.settingsNav.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={section === key}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div hidden={section !== "budget"} className="settings-panel">
        <SettingsForm initial={summary.settings} onSaved={onSettings} />
        <Card title={C.PAYER}>
          <div className="flex flex-col gap-1 text-sm">
            <a
              href={addressUrl(payer.address)}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              <Mono>{payer.address}</Mono>
            </a>
            {payer.error ? (
              <ErrorBox>
                {C.BALANCE_ERROR.replace("{error}", payer.error)}
              </ErrorBox>
            ) : (
              <span className="text-lg font-semibold">
                {usdc(payer.usdcBalance)}
              </span>
            )}
          </div>
        </Card>
      </div>
      <div hidden={section !== "keys"} className="settings-panel">
        <div className="studio-key-intro">
          <StudioArtwork kind="agent" />
          <div>
            <p>{S.keyIntro}</p>
            <SetupGuide compact />
          </div>
        </div>
        <AgentKeys />
      </div>
      <div hidden={section !== "approvals"} className="settings-panel">
        <p className="studio-page-subtitle">{S.approvalsIntro}</p>
        <Holds holds={summary.pendingHolds} now={now} />
        <SetApprover />
        <Notifications notifications={summary.notifications} />
      </div>
    </div>
  );
}
