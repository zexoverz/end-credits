import { describe, expect, it } from "vitest";
import { attribute, candidateNames, docsPackage, repoUrl, type AttributeInput } from "./score";
import type { LedgerLine } from "./types";

const installed = {
  zod: { version: "3.23.8", homepage: "https://zod.dev", repository: "git+https://github.com/colinhacks/zod.git" },
  viem: { version: "2.21.0", homepage: "https://viem.sh", repository: { url: "https://github.com/wevm/viem" } },
  yaml: { version: "2.9.1", homepage: "https://eemeli.org/yaml/" },
  lodash: { version: "4.17.21", homepage: "https://lodash.com/" },
  "@tanstack/react-query": { version: "5.0.0", homepage: "https://tanstack.com/query" },
  "@tanstack/react-router": { version: "1.0.0", homepage: "https://tanstack.com/router" },
  gh: { version: "1.0.0", homepage: "https://github.com/someone/gh#readme" },
};

const base: AttributeInput = {
  lines: [],
  startDeps: ["zod", "viem", "yaml", "@tanstack/react-query", "@tanstack/react-router", "gh"],
  endDeps: ["zod", "viem", "yaml", "@tanstack/react-query", "@tanstack/react-router", "gh"],
  installed,
};

const code = (f: string, ...specs: string[]): LedgerLine => ({ t: "code", f, specs });
const read = (p: string): LedgerLine => ({ t: "read", p });
const run = (lines: LedgerLine[], over: Partial<AttributeInput> = {}) =>
  attribute({ ...base, lines, ...over });
const byName = (lines: LedgerLine[], over: Partial<AttributeInput> = {}) =>
  Object.fromEntries(run(lines, over).map((p) => [p.name, p]));

describe("installed set", () => {
  it("drops a package that is not installed", () => {
    const res = byName([read("/r/node_modules/ghost/index.js"), code("f1", "ghost")], {
      endDeps: [...base.endDeps, "ghost"],
    });
    expect(res.ghost).toBeUndefined();
  });
});

describe("direct dependencies only for import and dep_added", () => {
  it("drops an import of an installed transitive package", () => {
    expect(byName([code("f1", "lodash/fp")]).lodash).toBeUndefined();
  });

  it("drops a dep_added for a package that is not a direct dependency", () => {
    expect(byName([{ t: "add", pkgs: ["lodash"] }]).lodash).toBeUndefined();
  });

  it("still credits reads of a transitive package", () => {
    expect(byName([read("/r/node_modules/lodash/map.js")]).lodash?.signals).toEqual({
      read: { count: 1, evidence: ["lodash/map.js"] },
    });
  });
});

describe("caps per signal", () => {
  it("import: 5 distinct files", () => {
    const lines = ["a", "b", "c", "d", "e", "f", "g", "a"].map((f) => code(f, "zod"));
    const zod = byName(lines).zod;
    expect(zod.signals.import).toEqual({ count: 5 });
    expect(zod.score).toBe(15);
  });

  it("import counts distinct files, not calls", () => {
    expect(byName([code("a", "zod"), code("a", "zod", "zod/v4")]).zod.signals.import).toEqual({
      count: 1,
    });
  });

  it("read: 10 distinct files", () => {
    const lines = Array.from({ length: 15 }, (_, i) => read(`/r/node_modules/zod/f${i}.d.ts`));
    const zod = byName([...lines, lines[0]]).zod;
    expect(zod.signals.read?.count).toBe(10);
    expect(zod.signals.read?.evidence).toHaveLength(10);
    expect(zod.score).toBe(10);
  });

  it("docs: 5 distinct URLs", () => {
    const lines: LedgerLine[] = Array.from({ length: 7 }, (_, i) => ({
      t: "docs",
      u: `https://zod.dev/page${i}`,
    }));
    const zod = byName(lines).zod;
    expect(zod.signals.docs?.count).toBe(5);
    expect(zod.score).toBe(10);
  });

  it("dep_added: once", () => {
    const res = byName([{ t: "add", pkgs: ["lodash"] }, { t: "add", pkgs: ["lodash"] }], {
      endDeps: [...base.endDeps, "lodash"],
    });
    expect(res.lodash.signals.dep_added).toEqual({ count: 1 });
    expect(res.lodash.score).toBe(5);
  });
});

describe("dep diff", () => {
  it("credits a dependency added during the session", () => {
    const res = byName([], { endDeps: [...base.endDeps, "lodash"] });
    expect(res.lodash.signals).toEqual({ dep_added: { count: 1 } });
  });

  it("does not credit a dependency present at start", () => {
    expect(byName([]).zod).toBeUndefined();
  });

  it("an add line credits a direct dependency even if it was there at start", () => {
    // DESIGN §5: dep_added = (end − start) ∪ add lines; only the diff part is start-aware.
    expect(byName([{ t: "add", pkgs: ["zod"] }]).zod.signals.dep_added).toEqual({ count: 1 });
  });
});

describe("docs URL mapping", () => {
  const map = (u: string) => docsPackage(u, installed);

  it("homepage host", () => {
    expect(map("https://zod.dev/api#objects")).toEqual({ name: "zod", ambiguous: false });
    expect(map("https://www.zod.dev/api")).toBeNull();
  });

  it("GitHub repo URL prefix", () => {
    expect(map("https://github.com/wevm/viem/blob/main/README.md")?.name).toBe("viem");
    expect(map("https://github.com/colinhacks/zod")?.name).toBe("zod");
    expect(map("https://github.com/colinhacks/zodiac")).toBeNull();
  });

  it("a GitHub homepage is a repo prefix, not a host match", () => {
    expect(map("https://github.com/someone/gh/issues")?.name).toBe("gh");
    expect(map("https://github.com/other/thing")).toBeNull();
  });

  it("npmjs.com, unpkg and jsdelivr paths", () => {
    expect(map("https://www.npmjs.com/package/yaml")?.name).toBe("yaml");
    expect(map("https://www.npmjs.com/package/@tanstack/react-query")?.name).toBe(
      "@tanstack/react-query",
    );
    expect(map("https://unpkg.com/viem@2.21.0/package.json")?.name).toBe("viem");
    expect(map("https://cdn.jsdelivr.net/npm/zod@3/README.md")?.name).toBe("zod");
    expect(map("https://www.npmjs.com/package/left-pad")).toBeNull();
  });

  it("ambiguous host: the name in the path wins, else the first alphabetically", () => {
    expect(map("https://tanstack.com/router/latest/docs/react-router")).toEqual({
      name: "@tanstack/react-router",
      ambiguous: true,
    });
    expect(map("https://tanstack.com/start")).toEqual({
      name: "@tanstack/react-query",
      ambiguous: true,
    });
  });

  it("a package that is not installed never matches", () => {
    expect(docsPackage("https://zod.dev", { viem: installed.viem })).toBeNull();
  });

  it("invalid URLs are skipped", () => {
    expect(map("not a url")).toBeNull();
  });

  it("records ambiguous in evidence", () => {
    const res = byName([{ t: "docs", u: "https://tanstack.com/start" }]);
    expect(res["@tanstack/react-query"].signals.docs?.evidence).toEqual([
      "ambiguous https://tanstack.com/start",
    ]);
  });
});

describe("repoUrl", () => {
  it("normalises npm repository forms", () => {
    expect(repoUrl("git+https://github.com/colinhacks/zod.git")).toBe("https://github.com/colinhacks/zod");
    expect(repoUrl({ url: "git://github.com/a/b.git" })).toBe("https://github.com/a/b");
    expect(repoUrl("github:a/b")).toBe("https://github.com/a/b");
    expect(repoUrl("a/b")).toBe("https://github.com/a/b");
    expect(repoUrl("git@github.com:a/b.git")).toBe("https://github.com/a/b");
    expect(repoUrl("https://gitlab.com/a/b")).toBeNull();
    expect(repoUrl(undefined)).toBeNull();
  });
});

describe("score and roles", () => {
  it("weights signals and assigns roles", () => {
    const lines: LedgerLine[] = [
      code("a", "zod"), code("b", "zod"), // zod 6
      code("a", "viem"), // viem 3 + docs 2 = 5
      { t: "docs", u: "https://viem.sh/docs" },
      read("/r/node_modules/yaml/a.d.ts"), read("/r/node_modules/yaml/b.d.ts"), // yaml 2
      { t: "docs", u: "https://tanstack.com/query/latest" }, // react-query 2 (docs)
      read("/r/node_modules/lodash/a.js"), // lodash 1
    ];
    const res = run(lines, { endDeps: [...base.endDeps] });
    expect(res.map((p) => [p.name, p.score, p.role])).toEqual([
      ["zod", 6, "starring"],
      ["viem", 5, "starring"],
      ["@tanstack/react-query", 2, "starring"],
      ["yaml", 2, "thanks"],
      ["lodash", 1, "thanks"],
    ]);
    expect(res.find((p) => p.name === "zod")?.version).toBe("3.23.8");
  });

  it("featuring for import-led and research for docs-led packages outside the top 3", () => {
    const lines: LedgerLine[] = [
      ...["a", "b", "c", "d", "e"].map((f) => code(f, "zod")),
      ...["a", "b", "c", "d"].map((f) => code(f, "viem")),
      ...["a", "b", "c"].map((f) => code(f, "gh")),
      code("a", "yaml"),
      { t: "docs", u: "https://tanstack.com/query/v5" },
    ];
    const roles = Object.fromEntries(run(lines).map((p) => [p.name, p.role]));
    expect(roles).toEqual({
      zod: "starring",
      viem: "starring",
      gh: "starring",
      yaml: "featuring",
      "@tanstack/react-query": "research",
    });
  });

  it("Bash read lines with several paths count each path", () => {
    const res = byName([{ t: "read", ps: ["node_modules/zod/a.d.ts", "node_modules/viem/b.d.ts"] }]);
    expect(res.zod.signals.read?.count).toBe(1);
    expect(res.viem.signals.read?.count).toBe(1);
  });
});

describe("candidateNames", () => {
  it("lists every package the ledger or the deps mention", () => {
    const names = candidateNames(
      [
        code("a", "zod", "./x", "node:fs"),
        read("/r/node_modules/.pnpm/y@1/node_modules/yaml/a.js"),
        { t: "read", ps: ["node_modules/@x402/core/x"] },
        { t: "add", pkgs: ["viem"] },
        { t: "docs", u: "https://x" },
      ],
      ["lodash"],
    );
    expect(names.sort()).toEqual(["@x402/core", "lodash", "viem", "yaml", "zod"]);
  });
});
