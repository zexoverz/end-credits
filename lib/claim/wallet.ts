// POST /api/claim/<pkg>/wallet (T10.2): the maintainer can push to the package's repo, the package
// has no payee yet, and the passkey wallet address is stored on a claim with status 'wallet'.
import { checksum } from "../payee/parse";
import { canPush } from "../github/claim";
import { githubFor, isReply, loadContext } from "./context";
import type { ClaimDeps } from "./deps";
import { claimView, fail, reply, type Reply } from "./view";

const RESET = {
  status: "wallet",
  prMode: null,
  prNumber: null,
  prUrl: null,
  mergedSha: null,
  verifiedFundingSha: null,
  screenId: null,
  failureCode: null,
} as const;

export async function setWallet(
  name: string,
  maintainerId: string | undefined,
  body: unknown,
  deps: ClaimDeps,
): Promise<Reply> {
  const ctx = await loadContext(name, maintainerId, deps);
  if (isReply(ctx)) return ctx;
  const parsed = checksum((body as { address?: unknown } | null)?.address);
  if (!parsed.address) return fail(400, "invalid_address");
  if (!ctx.token) return fail(401, "signed_out");

  const push = await canPush(githubFor(ctx.token, deps), ctx.repo);
  if (!push.ok) {
    return fail(403, "no_permission", { code: "NO_PERMISSION", vars: { repo: ctx.repo, package: name } });
  }

  // A payee from our own earlier claim does not block a new one; any other source does.
  const payee = await deps.payeeOf(ctx.pkg);
  if (payee.address && payee.source !== "claim") {
    return fail(409, "already_payable", { code: "ALREADY_PAYABLE", vars: { package: name } });
  }

  const open = await deps.store.latestClaim(ctx.repo, ctx.maintainer.id);
  const values = { ...RESET, walletAddress: parsed.address };
  const row =
    open && open.status !== "claimed" && open.status !== "refused"
      ? await deps.store.updateClaim(open.id, values)
      : await deps.store.insertClaim({ repoFullName: ctx.repo, maintainerId: ctx.maintainer.id, ...values });
  return reply(claimView(ctx.repo, row));
}
