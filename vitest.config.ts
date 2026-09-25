import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["lib/**/*.test.ts", "cli/**/*.test.ts", "worker/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // Integration tests share one Postgres; run files one at a time when it is set.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
