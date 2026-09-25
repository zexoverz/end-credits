// Postgres access for the claim flow: maintainers, claims, and the packages of a repo.
import { and, countDistinct, desc, eq } from "drizzle-orm";
import type { db as dbFn } from "../db/client";
import { claims, credits, maintainers, packages } from "../db/schema";
import { packageKey } from "../payee/keys";
import type { NpmPackageWithDownloads } from "../registry/npm";

export type Database = ReturnType<typeof dbFn>;
export type Maintainer = typeof maintainers.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type PackageRow = typeof packages.$inferSelect;
export type ClaimPatch = Partial<Omit<ClaimRow, "id" | "createdAt">>;

export function claimStore(database: Database) {
  return {
    async upsertMaintainer(m: { githubId: number; githubLogin: string; tokenEnc: string }): Promise<string> {
      const [row] = await database
        .insert(maintainers)
        .values(m)
        .onConflictDoUpdate({
          target: maintainers.githubId,
          set: { githubLogin: m.githubLogin, tokenEnc: m.tokenEnc },
        })
        .returning({ id: maintainers.id });
      return row.id;
    },

    async maintainer(id: string): Promise<Maintainer | null> {
      const [row] = await database.select().from(maintainers).where(eq(maintainers.id, id));
      return row ?? null;
    },

    async dropToken(id: string): Promise<void> {
      await database.update(maintainers).set({ tokenEnc: null }).where(eq(maintainers.id, id));
    },

    async packageByName(name: string): Promise<PackageRow | null> {
      const [row] = await database
        .select()
        .from(packages)
        .where(and(eq(packages.ecosystem, "npm"), eq(packages.name, name)));
      return row ?? null;
    },

    async savePackage(p: NpmPackageWithDownloads): Promise<PackageRow> {
      const values = {
        repoFullName: p.repoFullName,
        repoDirectory: p.repoDirectory,
        homepage: p.homepage,
        weeklyDownloads: p.weeklyDownloads,
        firstPublishedAt: p.createdAt,
        fundingLinks: p.fundingLinks,
        fetchedAt: new Date(),
      };
      const [row] = await database
        .insert(packages)
        .values({ name: p.name, packageKey: packageKey(p.name), ...values })
        .onConflictDoUpdate({ target: [packages.ecosystem, packages.name], set: values })
        .returning();
      return row;
    },

    packagesOfRepo(repo: string): Promise<PackageRow[]> {
      return database.select().from(packages).where(eq(packages.repoFullName, repo));
    },

    async latestClaim(repo: string, maintainerId: string): Promise<ClaimRow | null> {
      const [row] = await database
        .select()
        .from(claims)
        .where(and(eq(claims.repoFullName, repo), eq(claims.maintainerId, maintainerId)))
        .orderBy(desc(claims.createdAt))
        .limit(1);
      return row ?? null;
    },

    async insertClaim(c: { repoFullName: string; maintainerId: string } & ClaimPatch): Promise<ClaimRow> {
      const [row] = await database.insert(claims).values(c).returning();
      return row;
    },

    async updateClaim(id: string, patch: ClaimPatch): Promise<ClaimRow> {
      const [row] = await database.update(claims).set(patch).where(eq(claims.id, id)).returning();
      return row;
    },

    // Sessions that reserved money for this package (CLAIM_HEADLINE's {sessions}).
    async reservedSessions(packageId: string): Promise<number> {
      const [row] = await database
        .select({ n: countDistinct(credits.sessionId) })
        .from(credits)
        .where(and(eq(credits.packageId, packageId), eq(credits.outcome, "reserved")));
      return Number(row?.n ?? 0);
    },
  };
}

export type ClaimStore = ReturnType<typeof claimStore>;
