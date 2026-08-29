import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pinned so the suite behaves identically on the Mac Mini, the Linux laptop
    // and CI. date-fns works in local time, so an unpinned zone makes every
    // calendar-boundary assertion depend on where it runs.
    env: { TZ: "UTC" },
  },
});
