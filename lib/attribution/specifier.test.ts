import { describe, expect, it } from "vitest";
import {
  extractSpecifiers,
  isSkippedSpecifier,
  isValidPackageName,
  packagesFromInstall,
  pathToPackage,
  specifierToPackage,
} from "./specifier";

describe("isSkippedSpecifier", () => {
  it.each(["./a", "../a", "/a", "node:fs", "@/a", "~/a", "#a", "fs", "fs/promises", "path"])(
    "skips %s",
    (spec) => {
      expect(isSkippedSpecifier(spec)).toBe(true);
    },
  );

  it.each(["zod", "@x402/core", "lodash/fp"])("keeps %s", (spec) => {
    expect(isSkippedSpecifier(spec)).toBe(false);
  });
});

describe("specifierToPackage", () => {
  it.each([
    ["./local", null],
    ["../up", null],
    ["/abs/file", null],
    ["node:fs", null],
    ["fs", null],
    ["path/posix", null],
    ["@/lib/db", null],
    ["~/lib/db", null],
    ["#internal", null],
  ])("skips %s", (spec, expected) => {
    expect(specifierToPackage(spec)).toBe(expected);
  });

  it("keeps a bare name", () => {
    expect(specifierToPackage("zod")).toBe("zod");
  });

  it("cuts a deep path to the package", () => {
    expect(specifierToPackage("lodash/fp/map")).toBe("lodash");
  });

  it("keeps scope and name of a scoped package", () => {
    expect(specifierToPackage("@x402/fetch")).toBe("@x402/fetch");
    expect(specifierToPackage("@tanstack/react-query/build/x")).toBe("@tanstack/react-query");
  });

  it("drops a scope without a name", () => {
    expect(specifierToPackage("@scope")).toBeNull();
  });

  it("drops invalid npm names", () => {
    expect(specifierToPackage("React")).toBeNull();
    expect(specifierToPackage("has space")).toBeNull();
    expect(specifierToPackage("${x}")).toBeNull();
  });
});

describe("isValidPackageName", () => {
  it("applies the npm rule and the 214 length limit", () => {
    expect(isValidPackageName("zod")).toBe(true);
    expect(isValidPackageName("@a/b.c_d~e")).toBe(true);
    expect(isValidPackageName(".hidden")).toBe(false);
    expect(isValidPackageName("_under")).toBe(false);
    expect(isValidPackageName("a".repeat(214))).toBe(true);
    expect(isValidPackageName("a".repeat(215))).toBe(false);
  });
});

describe("pathToPackage", () => {
  it("reads a plain node_modules path", () => {
    expect(pathToPackage("/repo/node_modules/zod/lib/types.d.ts")).toEqual({
      name: "zod",
      inner: "zod/lib/types.d.ts",
    });
  });

  it("reads a scoped path", () => {
    expect(pathToPackage("/repo/node_modules/@x402/core/dist/index.d.ts")).toEqual({
      name: "@x402/core",
      inner: "@x402/core/dist/index.d.ts",
    });
  });

  it("takes the text after the last node_modules (pnpm)", () => {
    expect(
      pathToPackage("/repo/node_modules/.pnpm/zod@3.23.8/node_modules/zod/lib/index.d.ts"),
    ).toEqual({ name: "zod", inner: "zod/lib/index.d.ts" });
  });

  it("accepts a relative path starting at node_modules", () => {
    expect(pathToPackage("node_modules/viem/package.json")?.name).toBe("viem");
  });

  it("returns null outside node_modules or without a package segment", () => {
    expect(pathToPackage("/repo/src/zod.ts")).toBeNull();
    expect(pathToPackage("/repo/node_modules/")).toBeNull();
    expect(pathToPackage("/repo/node_modules/@scope")).toBeNull();
    expect(pathToPackage("/repo/node_modules/.pnpm/zod@3/")).toBeNull();
    expect(pathToPackage("/repo/node_modules/.bin/tsc")).toBeNull();
  });
});

describe("extractSpecifiers", () => {
  it("finds every import form", () => {
    const code = [
      `import { z } from 'zod';`,
      `import Default, * as ns from "viem";`,
      `import {`,
      `  a,`,
      `  b,`,
      `} from "@x402/fetch";`,
      `import 'reflect-metadata';`,
      `export { x } from "drizzle-orm/pg-core";`,
      `export * from './local';`,
      `const y = require("yaml");`,
      `const m = await import('postgres');`,
      `import type { T } from "iron-session";`,
    ].join("\n");
    expect(extractSpecifiers(code).sort()).toEqual(
      [
        "zod",
        "viem",
        "@x402/fetch",
        "reflect-metadata",
        "drizzle-orm/pg-core",
        "./local",
        "yaml",
        "postgres",
        "iron-session",
      ].sort(),
    );
  });

  it("returns each specifier once", () => {
    expect(extractSpecifiers(`import a from "zod"; import b from "zod";`)).toEqual(["zod"]);
  });

  it("returns nothing for plain text", () => {
    expect(extractSpecifiers("hello world, nothing imported here")).toEqual([]);
  });
});

describe("packagesFromInstall", () => {
  it("reads npm, pnpm, yarn and bun add commands", () => {
    expect(packagesFromInstall("npm i zod")).toEqual(["zod"]);
    expect(packagesFromInstall("npm install --save-dev vitest@^3 @types/node")).toEqual([
      "vitest",
      "@types/node",
    ]);
    expect(packagesFromInstall("pnpm add -D @x402/core@~2.27.0")).toEqual(["@x402/core"]);
    expect(packagesFromInstall("yarn add viem && yarn test")).toEqual(["viem"]);
    expect(packagesFromInstall("cd app; bun add yaml")).toEqual(["yaml"]);
  });

  it("ignores installs without names and non-registry specs", () => {
    expect(packagesFromInstall("npm install")).toEqual([]);
    expect(packagesFromInstall("pnpm add ./local github:a/b file:../x")).toEqual([]);
    expect(packagesFromInstall("git commit -m 'npm i zod'")).toEqual([]);
    expect(packagesFromInstall("ls -la")).toEqual([]);
  });
});
