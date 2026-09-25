// payee_observations access (DESIGN §3). Resolution and change detection take this interface, so
// tests run them against an in-memory store.
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { payeeObservations } from "../db/schema";

export type PayeeSource = "claim" | "drips" | "tea" | "npm_funding";

export type Observation = {
  packageId: string;
  address: string;
  source: PayeeSource;
  sourceUrl: string;
  observedAt: Date;
};

export interface ObservationStore {
  record(o: Omit<Observation, "observedAt">): Promise<void>;
  forPackage(packageId: string): Promise<Observation[]>;
}

export function dbObservations(database = db()): ObservationStore {
  return {
    async record(o) {
      await database.insert(payeeObservations).values(o);
    },
    async forPackage(packageId) {
      const rows = await database
        .select()
        .from(payeeObservations)
        .where(eq(payeeObservations.packageId, packageId))
        .orderBy(desc(payeeObservations.observedAt));
      return rows.map((r) => ({ ...r, source: r.source as PayeeSource }));
    },
  };
}
