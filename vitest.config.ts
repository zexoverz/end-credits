import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["lib/**/*.test.ts", "cli/**/*.test.ts", "worker/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
