// `screens` table access for the Intercepta client (Drizzle).
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { screens } from "../db/schema";
import type { NewScreen, ScreenKey, ScreenKind, ScreenRepo, StoredScreen } from "./cache";

export function drizzleScreenRepo(database = db()): ScreenRepo {
  return {
    async latestOk(key: ScreenKey): Promise<StoredScreen | null> {
      const [row] = await database
        .select()
        .from(screens)
        .where(
          and(
            eq(screens.kind, key.kind),
            eq(screens.subject, key.subject),
            key.chainId === null ? isNull(screens.chainId) : eq(screens.chainId, key.chainId),
            inArray(screens.status, [200, 404]),
          ),
        )
        .orderBy(desc(screens.fetchedAt))
        .limit(1);
      if (!row) return null;
      return { ...row, kind: row.kind as ScreenKind };
    },
    async insert(row: NewScreen): Promise<string> {
      const [inserted] = await database
        .insert(screens)
        .values({ ...row, response: row.response ?? {} })
        .returning({ id: screens.id });
      return inserted.id;
    },
  };
}
