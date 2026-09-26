// The four claim steps. Each renders from the step state; actions come in from claim-page.tsx.
"use client";

import { useState, type ReactNode } from "react";
import { Button, Mono } from "@/components/ui";
import {
  loginUrl,
  parseAddress,
  type ClaimView,
  type Notice,
  type StepState,
} from "@/lib/client/claim";
import { addressUrl } from "@/lib/client/format";
import { claimCopy, type ClaimCopyCode } from "@/lib/copy/claim";
import { ClaimReceipt } from "./claim-receipt";
import { NoticeLine } from "./header";

const STATE_LABEL: Record<StepState, ClaimCopyCode> = {
  done: "DONE",
  active: "ACTIVE",
  locked: "LOCKED",
  failed: "FAILED",
};
const STATE_CLS: Record<StepState, string> = {
  done: "text-paid",
  active: "text-foreground font-semibold",
  locked: "text-muted",
  failed: "text-refused",
};

export function Step({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: ClaimCopyCode;
  state: StepState;
  children?: ReactNode;
}) {
  const body =
    state !== "locked" && children ? (
      <div className="claim-step-body">{children}</div>
    ) : null;
  const heading = (
    <>
      <span className="claim-step-number" aria-hidden="true">
        {state === "done" ? "✓" : `0${n}`}
      </span>
      <h3>{claimCopy(title)}</h3>
      <span className={`claim-step-state ${STATE_CLS[state]}`}>
        {claimCopy(STATE_LABEL[state])}
      </span>
    </>
  );
  return (
    <li
      data-state={state}
      aria-current={state === "active" ? "step" : undefined}
    >
      {state === "done" && n !== 4 ? (
        <details>
          <summary>{heading}</summary>
          {body}
        </details>
      ) : (
        <>
          <div className="claim-step-heading">{heading}</div>
          {body}
        </>
      )}
    </li>
  );
}

const WalletLink = ({ address }: { address: string }) => (
  <a
    className="underline"
    href={addressUrl(address)}
    target="_blank"
    rel="noreferrer"
  >
    <Mono>{address}</Mono>
  </a>
);

export function GithubStep({
  name,
  repo,
  login,
  cancelled,
}: {
  name: string;
  repo: string;
  login: string | null;
  cancelled: boolean;
}) {
  if (login) return <p>{claimCopy("GITHUB_AS", { login })}</p>;
  return (
    <>
      {cancelled && (
        <NoticeLine
          notice={{
            tone: "error",
            text: claimCopy("GITHUB_CANCELLED"),
            code: "cancelled",
          }}
        />
      )}
      <p className="text-muted">{claimCopy("GITHUB_WHY", { repo })}</p>
      <p>{claimCopy("RETURN_NOTE")}</p>
      <a href={loginUrl(name)} className="product-button">
        {claimCopy("GITHUB_BUTTON")}
      </a>
    </>
  );
}

type WalletProps = {
  claim: ClaimView | null;
  done: boolean;
  busy: boolean;
  waiting: boolean;
  notice: Notice | null;
  onPasskey: () => void;
  onAddress: (address: string) => void;
};

export function WalletStep({
  claim,
  done,
  busy,
  waiting,
  notice,
  onPasskey,
  onAddress,
}: WalletProps) {
  const [typed, setTyped] = useState("");
  const [invalid, setInvalid] = useState(false);
  if (done && claim?.wallet) {
    return (
      <p>
        {claimCopy("WALLET_SET")} <WalletLink address={claim.wallet} />
      </p>
    );
  }
  const submit = () => {
    if (busy) return;
    const a = parseAddress(typed);
    setInvalid(!a);
    if (a) onAddress(a);
  };
  return (
    <>
      <p className="text-muted">{claimCopy("WALLET_WHY")}</p>
      <Button onClick={onPasskey} disabled={busy}>
        {waiting ? claimCopy("WALLET_CONNECTING") : claimCopy("WALLET_BUTTON")}
      </Button>
      <div className="space-y-1">
        <label htmlFor="wallet-address" className="block text-muted">
          {claimCopy("WALLET_OR")}
        </label>
        <form
          className="claim-address-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            id="wallet-address"
            className="w-full rounded border border-line bg-background px-2 py-1 font-mono text-xs"
            placeholder={claimCopy("ADDRESS_PLACEHOLDER")}
            aria-invalid={invalid}
            aria-describedby="wallet-hint"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button type="submit" disabled={busy || !typed.trim()}>
            {claimCopy("WALLET_USE")}
          </Button>
        </form>
        <p id="wallet-hint">{claimCopy("ADDRESS_HINT")}</p>
      </div>
      {busy && <p role="status">{claimCopy("SAVING_WALLET")}</p>}
      {invalid && (
        <NoticeLine
          notice={{
            tone: "error",
            text: claimCopy("WALLET_INVALID"),
            code: "invalid",
          }}
        />
      )}
      <NoticeLine notice={notice} />
    </>
  );
}

type PrProps = {
  repo: string;
  claim: ClaimView | null;
  done: boolean;
  busy: boolean;
  notice: Notice | null;
  onOpen: () => void;
};

export function PrStep({ repo, claim, done, busy, notice, onOpen }: PrProps) {
  if (!done || !claim?.prUrl) {
    return (
      <>
        <p className="text-muted">{claimCopy("PR_WHY", { repo })}</p>
        {claim?.wallet && (
          <div className="claim-file">
            <span>{claimCopy("FILE_PREVIEW")}</span>
            <strong>{claimCopy("FUNDING_FILE")}</strong>
            <pre>
              {JSON.stringify(
                { drips: { ethereum: { ownedBy: claim.wallet } } },
                null,
                2,
              )}
            </pre>
          </div>
        )}
        <Button onClick={onOpen} disabled={busy}>
          {busy ? claimCopy("PR_OPENING") : claimCopy("PR_BUTTON")}
        </Button>
        <NoticeLine notice={notice} />
      </>
    );
  }
  return (
    <>
      <NoticeLine notice={notice} />
      {claim.prMode === "new_file_link" && (
        <div>
          <strong>{claimCopy("FALLBACK_TITLE")}</strong>
          <p>{claimCopy("FALLBACK_BODY")}</p>
        </div>
      )}
      {claim.prMode === "new_file_link" ? (
        <a
          href={claim.prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded bg-foreground px-5 py-3 text-base font-semibold text-background"
        >
          {claimCopy("PR_OPEN_GITHUB")}
        </a>
      ) : (
        <a
          className="underline"
          href={claim.prUrl}
          target="_blank"
          rel="noreferrer"
        >
          {claimCopy("PR_VIEW", { number: claim.prNumber ?? "" })}
        </a>
      )}
    </>
  );
}

type MergeProps = {
  claim: ClaimView | null;
  state: StepState;
  busy: boolean;
  notice: Notice | null;
  onCheck: () => void;
};

export function MergeStep({ claim, state, busy, notice, onCheck }: MergeProps) {
  if (state === "done" && claim)
    return (
      <>
        <NoticeLine notice={notice} />
        <ClaimReceipt claim={claim} />
      </>
    );
  const code = notice?.code ?? claim?.code;
  const title =
    state === "failed"
      ? "REFUSED_TITLE"
      : code === "COOLING"
        ? "COOLING_TITLE"
        : code === "SCREEN_UNAVAILABLE"
          ? "SCREEN_TITLE"
          : code === "FUNDING_MISMATCH"
            ? "MISMATCH_TITLE"
            : claim?.status === "merged" || claim?.status === "verified"
              ? "VERIFY_TITLE"
              : "WAIT_TITLE";
  return (
    <>
      <div className="claim-verify" data-failed={state === "failed"}>
        <span className="claim-signal" aria-hidden="true" />
        <h4>{claimCopy(title)}</h4>
        {state === "active" && (
          <p>
            {claimCopy(
              claim?.status === "pr_open" ? "MERGE_EXTERNAL" : "VERIFY_BODY",
            )}
          </p>
        )}
      </div>
      {state === "active" &&
        claim?.status === "pr_open" &&
        claim.prMode === "new_file_link" && (
          <div className="claim-fallback">
            <strong>{claimCopy("FALLBACK_TITLE")}</strong>
            <p>{claimCopy("FALLBACK_BODY")}</p>
          </div>
        )}
      {state === "active" && claim?.status === "pr_open" && claim.prUrl && (
        <a
          className="product-button"
          href={claim.prUrl}
          target="_blank"
          rel="noreferrer"
        >
          {claimCopy(
            claim.prMode === "new_file_link"
              ? "PR_OPEN_GITHUB"
              : "MERGE_ACTION",
          )}
        </a>
      )}
      <NoticeLine
        notice={
          notice ??
          (claim?.message
            ? {
                tone: state === "failed" ? "error" : "info",
                text: claim.message,
                code: claim.code,
              }
            : null)
        }
      />
      {state === "active" && (
        <div className="claim-check">
          <span>{claimCopy("AUTO_CHECK")}</span>
          <Button onClick={onCheck} disabled={busy}>
            {claimCopy(busy ? "CHECKING" : "CHECK_NOW")}
          </Button>
        </div>
      )}
    </>
  );
}
