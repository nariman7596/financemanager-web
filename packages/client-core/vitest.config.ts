import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        // The SQL adapter's tests drive a real engine through node:sqlite.
        // Vite otherwise strips the `node:` prefix and fails to resolve it.
        external: [/^node:/],
      },
    },
  },
});
