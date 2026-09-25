// The /npm/<name> page body: loads GET /api/npm/<name>, runs the claim calls, polls the status.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Page } from "@/components/ui";
import { api } from "@/lib/client/api";
import {
  blocker,
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

export function ClaimPage({ name, githubCancelled }: { name: string; githubCancelled: boolean }) {
  const [summary, setSummary] = useState<PackageSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimView | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [walletNotice, setWalletNotice] = useState<Notice | null>(null);
  const [prNotice, setPrNotice] = useState<Notice | null>(null);
  const [statusNotice, setStatusNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const r = await api<PackageSummary>(summaryPath(name));
    if (!r.ok) {
      setLoadError(r.status === 404 ? claimCopy("NOT_FOUND") : claimCopy("LOAD_FAILED", { error: r.error }));
      return null;
    }
    setSummary(r.data);
    setClaim(r.data.claim);
    return r.data;
  }, [name]);

  const check = useCallback(
    async (method: "GET" | "POST") => {
      const r = await api<ClaimView>(claimPath(name, "status"), { method });
      if (!r.ok) {
        setStatusNotice(errorNotice(r.body, r.status));
        return;
      }
      setClaim(r.data);
      setStatusNotice(viewNotice(r.data));
      if (r.data.status === "claimed") await load();
    },
    [name, load],
  );

  // First load; an open claim asks the status once so its message shows.
  useEffect(() => {
    let live = true;
    load().then((s) => {
      if (live && s?.claim && MOVING.has(s.claim.status)) void check("GET");
    });
    return () => {
      live = false;
    };
  }, [load, check]);

  const polling = shouldPoll(claim);
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => void check("GET"), POLL_MS);
    return () => clearInterval(t);
  }, [polling, check]);

  const postWallet = async (address: string) => {
    const r = await api<ClaimView>(claimPath(name, "wallet"), { method: "POST", body: JSON.stringify({ address }) });
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

  const onPasskey = () =>
    run("wallet", async () => {
      try {
        const address = await connectPasskey();
        if (!address) return setWalletNotice({ tone: "error", text: walletErrorText(null), code: "wallet" });
        await postWallet(address);
      } catch (e) {
        setWalletNotice({ tone: "error", text: walletErrorText(e), code: "wallet" });
      }
    });

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
      {stop && stop !== "ALREADY_PAYABLE" && stop !== "NO_REPO" && (
        <NoticeLine notice={{ tone: "info", text: claimCopy(stop, { package: summary.package }), code: stop }} />
      )}
      <ol className="mt-4 space-y-3">
        <Step n={1} title="STEP_GITHUB" state={st.github}>
          <GithubStep name={name} repo={repo} login={summary.maintainer?.login ?? null} cancelled={githubCancelled} />
        </Step>
        <Step n={2} title="STEP_WALLET" state={st.wallet}>
          <WalletStep
            claim={claim}
            done={st.wallet === "done"}
            busy={busy === "wallet"}
            notice={walletNotice}
            onPasskey={onPasskey}
            onAddress={(a) => void run("wallet", () => postWallet(a))}
          />
        </Step>
        <Step n={3} title="STEP_PR" state={st.pr}>
          <PrStep repo={repo} claim={claim} done={st.pr === "done"} busy={busy === "pr"} notice={prNotice} onOpen={onPr} />
        </Step>
        <Step n={4} title="STEP_MERGE" state={st.merge}>
          <MergeStep
            claim={claim}
            state={st.merge}
            busy={busy === "status"}
            notice={statusNotice}
            onCheck={() => void run("status", () => check("POST"))}
          />
        </Step>
      </ol>
    </Page>
  );
}
