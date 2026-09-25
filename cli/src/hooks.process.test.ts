// The hook commands as Claude Code runs them: a process, stdin in, exit code and stdout out.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ENTRY = path.join(__dirname, "index.ts");
const SID = "3f1c2d4e-0000-4000-8000-000000000003";

function run(cmd: string, stdin: string, home: string) {
  return spawnSync(process.execPath, ["--import", "tsx", ENTRY, cmd], {
    input: stdin,
    env: { ...process.env, ENDCREDITS_HOME: home },
    encoding: "utf8",
  });
}

describe("hook commands as processes", () => {
  it.each(["record", "start"])("%s: malformed stdin exits 0 with nothing on stdout", (cmd) => {
    const home = mkdtempSync(path.join(tmpdir(), "ec-proc-"));
    const res = run(cmd, "{{{ not json", home);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe("");
    expect(readFileSync(path.join(home, "errors.log"), "utf8")).toContain(cmd);
  });

  it("record: a real call writes the ledger and nothing on stdout", () => {
    const home = mkdtempSync(path.join(tmpdir(), "ec-proc-"));
    const res = run(
      "record",
      JSON.stringify({
        session_id: SID,
        tool_name: "Read",
        tool_input: { file_path: "/r/node_modules/zod/index.d.ts" },
      }),
      home,
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readFileSync(path.join(home, "sessions", `${SID}.jsonl`), "utf8")).toContain("zod");
  });
});
