// Shared ESLint config for framework-agnostic packages (packages/core, /sms,
// /client-core, …).
//
// The restricted imports are the enforcement half of the dependency rule in
// ARCHITECTURE.md §2: packages/core must run unchanged in a browser, in Hermes
// (React Native) and on the server, so it may not reach for Next.js, React
// Native or Node built-ins. Convention alone does not survive a refactor.
module.exports = {
  root: false,
  parser: "@typescript-eslint/parser",
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "next",
              "next/*",
              "react-native",
              "react-native/*",
              "expo",
              "expo/*",
              "**/apps/*",
            ],
            message:
              "packages/* must stay platform-agnostic — no framework or app imports. See ARCHITECTURE.md §2.",
          },
        ],
        paths: [
          { name: "fs", message: "Node built-ins do not exist in Hermes or the browser." },
          { name: "node:fs", message: "Node built-ins do not exist in Hermes or the browser." },
          { name: "path", message: "Node built-ins do not exist in Hermes or the browser." },
          { name: "node:path", message: "Node built-ins do not exist in Hermes or the browser." },
        ],
      },
    ],
  },
};
