import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readEnv } from "../env";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  cached ??= drizzle(postgres(readEnv("DATABASE_URL"), { max: 5 }), { schema });
  return cached;
}
