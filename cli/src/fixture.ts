// Test helper: a scratch project with node_modules and an End Credits home holding one session.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LedgerLine } from "../../lib/attribution/types";

export interface Fixture {
  home: string;
  cwd: string;
  sid: string;
}

export function makeFixture(
  lines: LedgerLine[],
  opts: { startDeps?: Record<string, string>; endDeps?: Record<string, string> } = {},
): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "ec-fx-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "proj");
  const sid = "3f1c2d4e-0000-4000-8000-00000000f1f1";
  const pkg = (name: string, meta: Record<string, unknown>) => {
    const dir = path.join(cwd, "node_modules", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, ...meta }));
  };
  pkg("zod", { version: "3.23.8", homepage: "https://zod.dev" });
  pkg("viem", { version: "2.21.0", repository: "wevm/viem" });
  pkg("lodash", { version: "4.17.21" });
  const endDeps = opts.endDeps ?? { zod: "^3", viem: "^2" };
  writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify({ name: "reports-app", dependencies: endDeps }),
  );
  mkdirSync(path.join(home, "sessions"), { recursive: true });
  writeFileSync(
    path.join(home, "sessions", `${sid}.start.json`),
    JSON.stringify({ cwd, startedAt: "2026-09-26T01:00:00.000Z", deps: opts.startDeps ?? endDeps }),
  );
  writeFileSync(
    path.join(home, "sessions", `${sid}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
  return { home, cwd, sid };
}
