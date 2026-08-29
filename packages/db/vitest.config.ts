import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // These talk to a real Postgres; running files in parallel would have them
    // truncating each other's tables.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
