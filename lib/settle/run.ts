// One settler tick: claim a waiting session and settle it. A crash marks the session failed and
// logs the error's name only (messages may carry RPC URLs or keys).
import { errorLabel, settleSession, type SettleDeps } from "./settle";
import { claimNextSession, failSession } from "./store";

export async function settleNext(deps: SettleDeps): Promise<string | null> {
  const id = await claimNextSession(deps.database);
  if (!id) return null;
  try {
    await settleSession(id, deps);
  } catch (err) {
    await failSession(deps.database, id);
    deps.log?.(`settle: session ${id} failed: ${errorLabel(err)}`);
  }
  return id;
}
