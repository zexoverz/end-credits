// Worker process: the settler (every 2 s) and the expirer (every 30 s). SIGTERM or SIGINT lets the
// tick in flight finish, then exits.
import { chain } from "../lib/chain/keys";
import { db } from "../lib/db/client";
import { checkEnv, WORKER_BOOT } from "../lib/env";
import { settleDepsFromEnv, settleDepsPerOwner } from "../lib/settle/deps";
import { startExpirer } from "./expirer";
import { startSettler } from "./settler";

checkEnv(WORKER_BOOT);

const log = (line: string) => console.error(line);
const loops = [startSettler(settleDepsFromEnv(process.env, log), log, settleDepsPerOwner(process.env, log)), startExpirer(db(), chain(), log)];
console.log("end-credits worker up");

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`end-credits worker: ${signal}, finishing the current tick`);
  await Promise.all(loops.map((l) => l.stop()));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
