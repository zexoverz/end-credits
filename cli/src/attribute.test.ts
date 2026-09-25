import { appendFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUpload, formatTable, readLedger } from "./attribute";
import { makeFixture } from "./fixture";

describe("readLedger", () => {
  it("skips malformed lines", () => {
    const fx = makeFixture([{ t: "docs", u: "https://zod.dev" }]);
    appendFileSync(path.join(fx.home, "sessions", `${fx.sid}.jsonl`), "garbage\n{\"t\":\"nope\"}\n");
    expect(readLedger(fx.home, fx.sid)).toEqual([{ t: "docs", u: "https://zod.dev" }]);
  });
});

describe("buildUpload", () => {
  it("attributes from the ledger, the start snapshot and node_modules", () => {
    const fx = makeFixture(
      [
        { t: "code", f: "h1", specs: ["zod", "lodash"] },
        { t: "read", p: `/x/node_modules/lodash/map.js` },
        { t: "docs", u: "https://github.com/wevm/viem/blob/main/README.md" },
        { t: "read", ps: ["node_modules/ghost/index.js"] },
      ],
      { startDeps: { zod: "^3" }, endDeps: { zod: "^3", viem: "^2" } },
    );
    const { body, packages } = buildUpload(fx.home, fx.sid, new Date("2026-09-26T02:00:00Z"));
    expect(body).toEqual({
      claudeSessionId: fx.sid,
      repoLabel: "reports-app",
      startedAt: "2026-09-26T01:00:00.000Z",
      endedAt: "2026-09-26T02:00:00.000Z",
      packages: [
        {
          name: "viem",
          version: "2.21.0",
          signals: {
            dep_added: { count: 1 },
            docs: { count: 1, evidence: ["https://github.com/wevm/viem/blob/main/README.md"] },
          },
        },
        { name: "zod", version: "3.23.8", signals: { import: { count: 1 } } },
        {
          name: "lodash",
          version: "4.17.21",
          signals: { read: { count: 1, evidence: ["lodash/map.js"] } },
        },
      ],
    });
    expect(packages.map((p) => p.role)).toEqual(["starring", "starring", "starring"]);
  });

  it("never sends repo paths", () => {
    const fx = makeFixture([
      { t: "read", p: `/Users/me/secret-repo/node_modules/zod/lib/types.d.ts` },
    ]);
    const { body } = buildUpload(fx.home, fx.sid, new Date());
    expect(JSON.stringify(body)).not.toContain("secret-repo");
    expect(JSON.stringify(body)).not.toContain(fx.cwd);
  });
});

describe("formatTable", () => {
  it("prints one row per package", () => {
    const fx = makeFixture([{ t: "code", f: "h1", specs: ["zod"] }]);
    const table = formatTable(buildUpload(fx.home, fx.sid, new Date()).packages);
    expect(table).toMatch(/zod\s+3\.23\.8\s+starring\s+3\s+import 1/);
  });
});
