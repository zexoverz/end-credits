// POST /api/claim/<pkg>/pr (T10.3): open the FUNDING.json pull request with the maintainer's
// token, or hand back the prefilled new-file link when GitHub refuses the write.
import { getAddress } from "viem";
import { openFundingPr } from "../github/claim";
import { githubFor, isReply, loadContext } from "./context";
import type { ClaimDeps } from "./deps";
import { claimView, fail, reply, type Reply } from "./view";

export async function openPr(name: string, maintainerId: string | undefined, deps: ClaimDeps): Promise<Reply> {
  const ctx = await loadContext(name, maintainerId, deps);
  if (isReply(ctx)) return ctx;
  const row = await deps.store.latestClaim(ctx.repo, ctx.maintainer.id);
  if (!row?.walletAddress || (row.status !== "wallet" && row.status !== "pr_open")) {
    return fail(409, "no_wallet");
  }
  if (!ctx.token) return fail(401, "signed_out");

  const pr = await openFundingPr(githubFor(ctx.token, deps), ctx.repo, getAddress(row.walletAddress));
  const updated = await deps.store.updateClaim(row.id, {
    status: "pr_open",
    prMode: pr.mode,
    prNumber: pr.mode === "api" ? pr.number : null,
    prUrl: pr.url,
  });
  const note =
    pr.mode === "api"
      ? { code: "PR_OPENED" as const, vars: { number: pr.number } }
      : { code: "PR_LINK" as const, vars: { repo: ctx.repo, branch: pr.base } };
  return reply(claimView(ctx.repo, updated, note));
}
