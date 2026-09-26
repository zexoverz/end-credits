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
import { msg } from "@/lib/messages";
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
  return (
    <li
      data-state={state}
      className="rounded-lg border border-line bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {n}. {claimCopy(title)}
        </h2>
        <span className={`text-xs uppercase ${STATE_CLS[state]}`}>
          {claimCopy(STATE_LABEL[state])}
        </span>
      </div>
      {state !== "locked" && children && (
        <div className="mt-3 space-y-3 text-sm">{children}</div>
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
      <a
        href={loginUrl(name)}
        className="inline-block rounded bg-foreground px-3 py-1.5 text-background"
      >
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
        <div className="flex gap-2">
          <input
            id="wallet-address"
            className="w-full rounded border border-line bg-background px-2 py-1 font-mono text-xs"
            placeholder="0x…"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button onClick={submit} disabled={busy || !typed.trim()}>
            {claimCopy("WALLET_USE")}
          </Button>
        </div>
      </div>
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
  if (state === "done" && claim?.wallet) {
    const text =
      notice?.code === "CLAIMED"
        ? notice.text
        : msg("CLAIMED", {
            amount: claim.claimedAmount ?? "0",
            address: claim.wallet,
          });
    return (
      <>
        <NoticeLine notice={{ tone: "ok", text, code: "CLAIMED" }} />
        <p>
          {claimCopy("CLAIMED_TO")} <WalletLink address={claim.wallet} />
        </p>
      </>
    );
  }
  return (
    <>
      {state === "active" && (
        <p className="text-muted">{claimCopy("MERGE_WHY")}</p>
      )}
      <NoticeLine notice={notice} />
      {state === "active" && (
        <Button onClick={onCheck} disabled={busy}>
          {busy ? claimCopy("CHECKING") : claimCopy("CHECK_NOW")}
        </Button>
      )}
    </>
  );
}
