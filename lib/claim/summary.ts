// GET /api/npm/<name> (T10.5 backend): what the /npm/[name] page shows. The reserved amount and the
// cooling window come from the escrow itself (MultiBaas is wired on another branch); the session
// count from our credits. A failed read is reported in `errors`, never replaced by a number.
import { formatUnits, zeroAddress, type Hex } from "viem";
import { isValidPackageName } from "../attribution/specifier";
import { msg } from "../messages";
import { packageKey } from "../payee/keys";
import type { ClaimDeps } from "./deps";
import { maintSession } from "./session";
import type { PackageRow } from "./store";
import { claimView, type ClaimView } from "./view";

export type SummaryState = "nothing_reserved" | "reserved" | "in_progress" | "claimed" | "refused";

export type PackageSummary = {
  package: string;
  repo: string | null;
  state: SummaryState;
  reserved: string | null; // USDC; null when the chain read failed
  sessions: number;
  headline: string | null; // CLAIM_HEADLINE, when something is reserved
  alsoAccepts: string[];
  payee: { address: string; source: string } | null;
  alreadyPayable: string | null; // ALREADY_PAYABLE, when the payee is not from a claim
  cooling: { until: string; message: string } | null;
  maintainer: { login: string } | null;
  claim: ClaimView | null;
  errors: ("chain" | "payee")[];
};

function nameFrom(slug: string[]): string | null {
  try {
    const name = slug.map((p) => decodeURIComponent(p)).join("/");
    return isValidPackageName(name) ? name : null;
  } catch {
    return null;
  }
}

async function packageRow(name: string, deps: ClaimDeps): Promise<PackageRow | null> {
  const row = await deps.store.packageByName(name);
  if (row) return row;
  // Not stored yet: read npm, do not write.
  const npm = await deps.loadPackage(name).catch(() => null);
  if (!npm) return null;
  return {
    id: "",
    ecosystem: "npm",
    name,
    packageKey: packageKey(name),
    repoFullName: npm.repoFullName,
    repoDirectory: npm.repoDirectory,
    homepage: npm.homepage,
    weeklyDownloads: npm.weeklyDownloads,
    firstPublishedAt: npm.createdAt,
    fundingLinks: npm.fundingLinks,
    fetchedAt: null,
  };
}

async function readChain(key: Hex, deps: ClaimDeps, nowSec: bigint) {
  const [reserved, claim, delay] = await Promise.all([
    deps.chain.reserved(key),
    deps.chain.claimState(key),
    deps.chain.changeDelay(),
  ]);
  const until = claim.changedAt + delay;
  const cooling = claim.changed && nowSec < until ? new Date(Number(until) * 1000).toISOString() : null;
  return { reserved, claimed: claim.payee !== zeroAddress, cooling };
}

export async function packageSummary(req: Request, slug: string[], deps: ClaimDeps): Promise<Response> {
  const name = nameFrom(slug);
  if (!name) return Response.json({ error: "invalid_package" }, { status: 400 });
  const pkg = await packageRow(name, deps);
  if (!pkg) return Response.json({ error: "unknown_package" }, { status: 404 });

  const errors: PackageSummary["errors"] = [];
  const now = (deps.now ?? (() => new Date()))();
  const onChain = await readChain(pkg.packageKey as Hex, deps, BigInt(Math.floor(now.getTime() / 1000))).catch(
    () => (errors.push("chain"), null),
  );
  const payee = await deps.payeeOf(pkg, { observe: false }).catch(() => (errors.push("payee"), null));
  const sessions = pkg.id ? await deps.store.reservedSessions(pkg.id) : 0;

  const headers = new Headers();
  const session = await maintSession(req, headers, { secret: deps.secret, appUrl: deps.appUrl });
  const maintainer = session.maintainerId ? await deps.store.maintainer(session.maintainerId) : null;
  const claimRow = maintainer && pkg.repoFullName ? await deps.store.latestClaim(pkg.repoFullName, maintainer.id) : null;

  const reserved = onChain ? formatUnits(onChain.reserved, 6) : null;
  const found = payee?.address ? { address: payee.address, source: payee.source } : null;
  const state: SummaryState =
    claimRow?.status === "claimed" || claimRow?.status === "refused"
      ? claimRow.status
      : claimRow
        ? "in_progress"
        : found?.source === "claim" || onChain?.claimed
          ? "claimed"
          : onChain && onChain.reserved > 0n
            ? "reserved"
            : "nothing_reserved";

  const body: PackageSummary = {
    package: name,
    repo: pkg.repoFullName,
    state,
    reserved,
    sessions,
    headline:
      onChain && onChain.reserved > 0n ? msg("CLAIM_HEADLINE", { amount: reserved!, package: name, sessions }) : null,
    alsoAccepts: pkg.fundingLinks,
    payee: found,
    alreadyPayable: found && found.source !== "claim" ? msg("ALREADY_PAYABLE", { package: name }) : null,
    cooling: onChain?.cooling ? { until: onChain.cooling, message: msg("COOLING", { time: onChain.cooling }) } : null,
    maintainer: maintainer ? { login: maintainer.githubLogin } : null,
    claim: claimRow && pkg.repoFullName ? claimView(pkg.repoFullName, claimRow) : null,
    errors,
  };
  return Response.json(body, { headers });
}
