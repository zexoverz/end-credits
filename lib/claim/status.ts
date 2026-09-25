// GET or POST /api/claim/<pkg>/status (T10.4). Each call moves the claim as far as the evidence
// allows: PR merged → FUNDING.json on the default branch names the wallet → Intercepta screen →
// setClaim + claim for every reserved package of the repo. Repeat calls after 'claimed' or
// 'refused' only read the row.
import { getAddress, type Address } from "viem";
import { readFunding } from "../github/claim";
import { githubFor, isReply, loadContext, type ClaimContext } from "./context";
import type { ClaimDeps } from "./deps";
import { evidenceOf, payOut, refusalOf, screenWallet } from "./payout";
import type { ClaimRow } from "./store";
import { claimView, reply, type Note, type Reply } from "./view";

export async function checkStatus(
  name: string,
  maintainerId: string | undefined,
  deps: ClaimDeps,
): Promise<Reply> {
  const ctx = await loadContext(name, maintainerId, deps);
  if (isReply(ctx)) return ctx;
  const row = await deps.store.latestClaim(ctx.repo, ctx.maintainer.id);
  const view = (r: ClaimRow | null, note?: Note) => reply(claimView(ctx.repo, r, note));

  if (!row?.walletAddress) return view(row);
  if (row.status === "claimed") {
    return view(row, { code: "CLAIMED", vars: { amount: claimView(ctx.repo, row).claimedAmount ?? "0", address: row.walletAddress } });
  }
  if (row.status === "refused") return view(row, { code: "CLAIM_REFUSED", vars: { description: row.failureCode ?? "" } });
  if (row.status === "wallet" || row.status === "started") return view(row);
  return advance(ctx, row, getAddress(row.walletAddress), deps);
}

async function advance(ctx: ClaimContext, start: ClaimRow, wallet: Address, deps: ClaimDeps): Promise<Reply> {
  let row = start;
  const view = (r: ClaimRow, note?: Note) => reply(claimView(ctx.repo, r, note));
  const api = githubFor(ctx.token ?? deps.readToken, deps);
  const base = (await api.repo(ctx.repo)).defaultBranch;

  // 1. The proof: a merged PR (api mode), or just the file (new-file-link mode).
  let sha = row.mergedSha;
  if (row.prMode === "api" && !sha) {
    const pr = await api.pull(ctx.repo, row.prNumber!);
    if (!pr.merged) return view(row, { code: "PR_WAITING", vars: { number: pr.number } });
    sha = pr.mergeCommitSha;
    row = await deps.store.updateClaim(row.id, { status: "merged", mergedSha: sha });
  }

  // 2. The file on the default branch, read by us, must name the wallet.
  const file = await readFunding(api, ctx.repo, base);
  if (!file.present && row.prMode !== "api") {
    return view(row, { code: "PR_LINK", vars: { repo: ctx.repo, branch: base } });
  }
  const found = file.present ? file.address : null;
  if (found !== wallet) {
    row = await deps.store.updateClaim(row.id, { failureCode: "FUNDING_MISMATCH" });
    const shown = found ?? (file.present ? "an invalid address" : "no address");
    return view(row, { code: "FUNDING_MISMATCH", vars: { branch: base, found: shown, expected: wallet } });
  }
  sha ??= await api.branchSha(ctx.repo, base);
  row = await deps.store.updateClaim(row.id, {
    status: "verified",
    mergedSha: sha,
    verifiedFundingSha: file.present ? file.sha : null,
    failureCode: null,
  });

  // 3. Screen the wallet. Unavailable → stop here; the next check retries.
  const screen = await screenWallet(wallet, deps);
  const screenId = screen.screenId || null;
  if (!screen.ok) {
    await deps.store.updateClaim(row.id, { screenId });
    return view(row, { code: "SCREEN_UNAVAILABLE", vars: { error: screen.error } });
  }
  const refusal = refusalOf(screen);
  if (refusal) {
    row = await deps.store.updateClaim(row.id, { status: "refused", screenId, failureCode: refusal });
    return view(row, { code: "CLAIM_REFUSED", vars: { description: refusal } });
  }

  // 4. Recorder: setClaim + claim for every package of this repo with a reserve.
  const packages = await deps.store.packagesOfRepo(ctx.repo);
  const out = await payOut(packages, wallet, evidenceOf(ctx.repo, sha!), deps);
  const claimedMicro = (row.claimedMicro ?? 0n) + out.claimed;
  row = await deps.store.updateClaim(row.id, {
    screenId,
    setClaimTx: row.setClaimTx ?? out.setClaimTxs[0] ?? null,
    claimTxs: [...row.claimTxs, ...out.claimTxs],
    claimedMicro,
  });
  if (out.coolingUntil !== null) {
    const time = new Date(Number(out.coolingUntil) * 1000).toISOString();
    return view(row, { code: "COOLING", vars: { time }, coolingUntil: time });
  }
  row = await deps.store.updateClaim(row.id, { status: "claimed" });
  await deps.store.dropToken(ctx.maintainer.id);
  return view(row, { code: "CLAIMED", vars: { amount: claimView(ctx.repo, row).claimedAmount!, address: wallet } });
}
