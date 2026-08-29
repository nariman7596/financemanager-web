// Shared ESLint config for the Next.js app.
// The boundary rule below is the one from ARCHITECTURE.md §2 that keeps the
// dependency graph acyclic: shared packages must never reach back into an app.
module.exports = {
  extends: ["next/core-web-vitals"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/apps/*", "@financemanager/web/*"],
            message:
              "Apps must not import from another app. Share code through packages/* instead.",
          },
        ],
      },
    ],
  },
};
