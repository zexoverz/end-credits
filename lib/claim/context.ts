// Shared loading for the claim endpoints: the signed-in maintainer, their token, and the package's
// repo (read from the registry when our row has none yet).
import { unseal } from "../crypto/seal";
import { createGitHub, type GitHub } from "../github/api";
import type { ClaimDeps } from "./deps";
import type { Maintainer, PackageRow } from "./store";
import { fail, type Reply } from "./view";

export type ClaimContext = {
  maintainer: Maintainer;
  pkg: PackageRow;
  repo: string;
  token: string | null; // the user's OAuth token; null once the claim is done
};

export async function loadContext(
  name: string,
  maintainerId: string | undefined,
  deps: ClaimDeps,
): Promise<ClaimContext | Reply> {
  const maintainer = maintainerId ? await deps.store.maintainer(maintainerId) : null;
  if (!maintainer) return fail(401, "signed_out");

  let pkg = await deps.store.packageByName(name);
  if (!pkg?.repoFullName) {
    try {
      pkg = await deps.store.savePackage(await deps.loadPackage(name));
    } catch {
      if (!pkg) return fail(404, "unknown_package");
    }
  }
  if (!pkg.repoFullName) return fail(404, "no_repo");

  const token = maintainer.tokenEnc ? unseal(maintainer.tokenEnc, deps.secret) : null;
  return { maintainer, pkg, repo: pkg.repoFullName, token };
}

export function githubFor(token: string | null | undefined, deps: ClaimDeps): GitHub {
  return createGitHub({ token: token ?? undefined, fetch: deps.githubFetch });
}

export const isReply = (x: ClaimContext | Reply): x is Reply => "body" in x;
