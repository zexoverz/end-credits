// One settler tick: claim a waiting session and settle it. A crash marks the session failed and
// logs the error's name only (messages may carry RPC URLs or keys).
import { errorLabel, settleSession, type SettleDeps } from "./settle";
import { claimNextSession, failSession } from "./store";

/** Deps for one session: its owner's payer key. Without it, every session uses `deps`. */
export type DepsFor = (sessionId: string) => Promise<SettleDeps>;

export async function settleNext(deps: SettleDeps, depsFor?: DepsFor): Promise<string | null> {
  const id = await claimNextSession(deps.database);
  if (!id) return null;
  try {
    await settleSession(id, depsFor ? await depsFor(id) : deps);
  } catch (err) {
    await failSession(deps.database, id);
    deps.log?.(`settle: session ${id} failed: ${errorLabel(err)}`);
  }
  return id;
}
