// The /npm/<name> page body: loads GET /api/npm/<name>, runs the claim calls, polls the status.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicClaim } from "./public-claim";
import { INSIGHTS as C } from "@/lib/copy/control-room";
import { RiskProfile } from "./risk-profile";
import { Button, Page } from "@/components/ui";
import { api, type ApiResult } from "@/components/product/request";
import {
  blocker,
  loginUrl,
  claimPath,
  errorNotice,
  shouldPoll,
  steps,
  summaryPath,
  viewNotice,
  walletErrorText,
  type ClaimView,
  type Notice,
  type PackageSummary,
} from "@/lib/client/claim";
import { claimCopy } from "@/lib/copy/claim";
import { Header, NoticeLine } from "./header";
import { connectPasskey } from "./passkey";
import { GithubStep, MergeStep, PrStep, Step, WalletStep } from "./steps";

const POLL_MS = 5_000;
const MOVING = new Set(["pr_open", "merged", "verified", "claimed", "refused"]);

type Busy = null | "wallet" | "pr" | "status";

export function ClaimPage({
  name,
  githubCancelled,
}: {
  name: string;
  githubCancelled: boolean;
}) {
  const checking = useRef(false);
  const [checkingNow, setCheckingNow] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<Notice | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [summary, setSummary] = useState<PackageSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimView | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [waiting, setWaiting] = useState(false);
  const [walletNotice, setWalletNotice] = useState<Notice | null>(null);
  const [prNotice, setPrNotice] = useState<Notice | null>(null);
  const [statusNotice, setStatusNotice] = useState<Notice | null>(null);

  const apply = useCallback(
    (r: ApiResult<PackageSummary>): PackageSummary | null => {
      if (!r.ok) {
        setLoadError(
          r.status === 404
            ? claimCopy("NOT_FOUND")
            : claimCopy("LOAD_FAILED", { error: r.error }),
        );
        return null;
      }
      setLoadError(null);
      setSummary(r.data);
      setClaim(r.data.claim);
      return r.data;
    },
    [],
  );

  const load = useCallback(
    async () => apply(await api<PackageSummary>(summaryPath(name))),
    [name, apply],
  );

  const check = useCallback(
    async (method: "GET" | "POST") => {
      if (checking.current) return;
      checking.current = true;
      setCheckingNow(true);
      try {
        const r = await api<ClaimView>(claimPath(name, "status"), { method });
        setLastCheck(new Date().toLocaleTimeString());
        if (!r.ok) {
          setStatusNotice(errorNotice(r.body, r.status));
          return;
        }
        setClaim(r.data);
        setStatusNotice(viewNotice(r.data));
        if (r.data.status === "claimed") {
          // Refresh package evidence without replacing the confirmed receipt if a later read fails.
          const refreshed = await api<PackageSummary>(summaryPath(name));
          if (refreshed.ok) {
            setSummary(refreshed.data);
            setRefreshNotice(null);
          } else
            setRefreshNotice({
              tone: "error",
              code: "load",
              text: claimCopy("LOAD_FAILED", { error: refreshed.error }),
            });
        }
      } finally {
        checking.current = false;
        setCheckingNow(false);
      }
    },
    [name],
  );

  // First load; an open claim asks the status once so its message shows.
  useEffect(() => {
    let live = true;
    api<PackageSummary>(summaryPath(name)).then((r) => {
      if (!live) return;
      const s = apply(r);
      if (s?.claim && MOVING.has(s.claim.status)) void check("GET");
    });
    return () => {
      live = false;
    };
  }, [name, apply, check]);

  const polling = shouldPoll(claim);
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => void check("GET"), POLL_MS);
    return () => clearInterval(t);
  }, [polling, check]);

  const postWallet = async (address: string) => {
    const r = await api<ClaimView>(claimPath(name, "wallet"), {
      method: "POST",
      body: JSON.stringify({ address }),
    });
    if (!r.ok) return setWalletNotice(errorNotice(r.body, r.status));
    setWalletNotice(null);
    setClaim(r.data);
  };

  const run = async (kind: Busy, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  // Not tied to `busy`: a closed popup may never answer, and the button or the typed address must
  // still work after that.
  const onPasskey = async () => {
    setWaiting(true);
    setWalletNotice(null);
    try {
      const address = await connectPasskey();
      if (!address)
        return setWalletNotice({
          tone: "error",
          text: walletErrorText(null),
          code: "wallet",
        });
      await run("wallet", () => postWallet(address));
    } catch (e) {
      setWalletNotice({
        tone: "error",
        text: walletErrorText(e),
        code: "wallet",
      });
    } finally {
      setWaiting(false);
    }
  };

  const onPr = () =>
    run("pr", async () => {
      const r = await api<ClaimView>(claimPath(name, "pr"), { method: "POST" });
      if (!r.ok) return setPrNotice(errorNotice(r.body, r.status));
      setClaim(r.data);
      setPrNotice(viewNotice(r.data));
    });

  if (loadError) {
    return (
      <Page title={name}>
        <NoticeLine notice={{ tone: "error", text: loadError, code: "load" }} />
        <Button onClick={() => void load()}>{claimCopy("RETRY")}</Button>
      </Page>
    );
  }
  if (!summary) return <Page title={name}>{claimCopy("LOADING")}</Page>;

  const st = steps(summary, claim);
  const stop = blocker(summary, claim);
  const repo = summary.repo ?? "";
  return (
    <Page>
      <Header s={summary} />
      <nav className="package-section-nav">
        <a href="#payee-risk">{C.riskJump}</a>
        <a href="#maintainer-claim">{C.claimJump}</a>
      </nav>
      <PublicClaim claim={summary.claimed ?? null} />
      <RiskProfile
        profile={summary.payeeRisk ?? null}
        failed={summary.errors.includes("risk")}
        hasPayee={!!summary.payee}
      />
      <NoticeLine notice={refreshNotice} />
      {stop &&
        stop !== "ALREADY_PAYABLE" &&
        stop !== "NO_REPO" &&
        stop !== "PAYEE_REFUSED" && (
          <NoticeLine
            notice={{
              tone: "info",
              text: claimCopy(stop, { package: summary.package }),
              code: stop,
            }}
          />
        )}
      <section id="maintainer-claim" className="maintainer-flow">
        <aside className="claim-guide">
          <p className="claim-eyebrow">{claimCopy("EYEBROW")}</p>
          <h2>{claimCopy("FLOW_TITLE")}</h2>
          <p>{claimCopy("FLOW_INTRO")}</p>
          <div className="claim-reserve">
            <span>{claimCopy("RESERVE_LABEL")}</span>
            <strong>
              {summary.errors.includes("chain")
                ? "—"
                : (summary.reserved ?? "—")}
              <small>{claimCopy("USDC")}</small>
            </strong>
            <p>{claimCopy("NETWORK")}</p>
          </div>
          <svg
            className="claim-proof-art"
            viewBox="0 0 300 170"
            aria-hidden="true"
          >
            <path
              d="M48 90h200"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 7"
            />
            <rect
              x="18"
              y="40"
              width="92"
              height="100"
              rx="14"
              fill="#fff"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="m42 72-10 12 10 12m40-24 10 12-10 12M63 66l-8 36"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <rect
              x="190"
              y="57"
              width="92"
              height="68"
              rx="14"
              fill="#baf0ca"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M190 77h92m-27 17h27v18h-27z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="150" cy="90" r="19" fill="#252c23" />
            <path
              d="m140 90 7 7 13-14"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
            />
          </svg>
          <h3>{claimCopy("PROOF_TITLE")}</h3>
          <p>{claimCopy("PROOF_BODY")}</p>
          <p className="claim-gas-note">{claimCopy("GAS_NOTE")}</p>
        </aside>
        <ol className="claim-workflow" aria-label={claimCopy("JOURNEY")}>
          <Step n={1} title="STEP_GITHUB" state={st.github}>
            <GithubStep
              name={name}
              repo={repo}
              login={summary.maintainer?.login ?? null}
              cancelled={githubCancelled}
            />
          </Step>
          <Step n={2} title="STEP_WALLET" state={st.wallet}>
            <WalletStep
              claim={claim}
              done={st.wallet === "done"}
              busy={busy === "wallet"}
              waiting={waiting}
              notice={walletNotice}
              onPasskey={() => void onPasskey()}
              onAddress={(a) => void run("wallet", () => postWallet(a))}
            />
          </Step>
          <Step n={3} title="STEP_PR" state={st.pr}>
            <PrStep
              repo={repo}
              claim={claim}
              done={st.pr === "done"}
              busy={busy === "pr"}
              notice={prNotice}
              onOpen={onPr}
            />
          </Step>
          <Step n={4} title="STEP_MERGE" state={st.merge}>
            <MergeStep
              claim={claim}
              state={st.merge}
              busy={busy === "status" || checkingNow}
              notice={statusNotice}
              onCheck={() => void run("status", () => check("POST"))}
            />
          </Step>
        </ol>
      </section>
      {lastCheck && (
        <p className="claim-last-check">
          {claimCopy("LAST_CHECK")}: {lastCheck}
        </p>
      )}
      {[walletNotice, prNotice, statusNotice].some(
        (n) => n?.code === "signed_out",
      ) && (
        <a className="product-button" href={loginUrl(name)}>
          {claimCopy("REAUTH")}
        </a>
      )}
    </Page>
  );
}
