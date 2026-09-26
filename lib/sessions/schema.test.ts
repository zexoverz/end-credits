import { describe, expect, it } from "vitest";
import { uploadSchema } from "./schema";

const ok = {
  claudeSessionId: "3f1c2d4e-0000-4000-8000-000000000001",
  repoLabel: "reports-app",
  startedAt: "2026-09-26T01:00:00.000Z",
  endedAt: "2026-09-26T02:00:00.000Z",
  packages: [
    {
      name: "zod",
      version: "3.23.8",
      signals: { import: { count: 4 }, read: { count: 7, evidence: ["zod/lib/types.d.ts"] } },
    },
  ],
};

const withPackages = (packages: unknown[]) => ({ ...ok, packages });
const pkg = (name: string, signals: unknown = { import: { count: 1 } }) => ({ name, signals });

describe("uploadSchema", () => {
  it("accepts the DESIGN §6.1 body", () => {
    expect(uploadSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects names that break the npm rule", () => {
    expect(uploadSchema.safeParse(withPackages([pkg("Zod")])).success).toBe(false);
    expect(uploadSchema.safeParse(withPackages([pkg("../etc")])).success).toBe(false);
    expect(uploadSchema.safeParse(withPackages([pkg("a".repeat(215))])).success).toBe(false);
  });

  it.each([
    ["dep_added", 2],
    ["import", 6],
    ["docs", 6],
    ["read", 11],
  ])("rejects %s count %i above its cap", (signal, count) => {
    const body = withPackages([pkg("zod", { [signal]: { count } })]);
    expect(uploadSchema.safeParse(body).success).toBe(false);
  });

  it("accepts counts at the caps", () => {
    const body = withPackages([
      pkg("zod", { dep_added: { count: 1 }, import: { count: 5 }, docs: { count: 5 }, read: { count: 10 } }),
    ]);
    expect(uploadSchema.safeParse(body).success).toBe(true);
  });

  it("rejects more than 200 packages", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => pkg(`p${i}`));
    expect(uploadSchema.safeParse(withPackages(many(200))).success).toBe(true);
    expect(uploadSchema.safeParse(withPackages(many(201))).success).toBe(false);
  });

  it("rejects a package listed twice, an unknown signal and an empty signal set", () => {
    expect(uploadSchema.safeParse(withPackages([pkg("zod"), pkg("zod")])).success).toBe(false);
    expect(uploadSchema.safeParse(withPackages([pkg("zod", { stars: { count: 1 } })])).success).toBe(false);
    expect(uploadSchema.safeParse(withPackages([pkg("zod", {})])).success).toBe(false);
  });

  it("rejects a bad session id", () => {
    expect(uploadSchema.safeParse({ ...ok, claudeSessionId: "../x" }).success).toBe(false);
  });

  describe("declared repository and homepage", () => {
    const declared = (extra: Record<string, unknown>) => withPackages([{ ...pkg("@endcredits-demo/moved-payout"), ...extra }]);

    it("accepts a GitHub repository, string or object, and an https homepage", () => {
      expect(uploadSchema.safeParse(declared({ repository: "github:zexoverz/endcredits-fixture-moved-payout" })).success).toBe(true);
      expect(
        uploadSchema.safeParse(
          declared({ repository: { url: "https://github.com/a/b", directory: "packages/x" }, homepage: "https://b.dev" }),
        ).success,
      ).toBe(true);
    });

    it("rejects a non-GitHub repository", () => {
      expect(uploadSchema.safeParse(declared({ repository: "https://gitlab.com/a/b" })).success).toBe(false);
      expect(uploadSchema.safeParse(declared({ repository: "../secret-repo" })).success).toBe(false);
      expect(uploadSchema.safeParse(declared({ repository: { url: "https://github.com/a/b", directory: "../x" } })).success).toBe(false);
    });

    it("rejects a non-https homepage", () => {
      expect(uploadSchema.safeParse(declared({ homepage: "http://b.dev" })).success).toBe(false);
      expect(uploadSchema.safeParse(declared({ homepage: "file:///Users/me" })).success).toBe(false);
    });
  });
});
