import type { Config } from "tailwindcss";
import preset from "@financemanager/config/tailwind/preset";

// Design tokens (brand palette, `darkMode: "class"`) come from the shared
// preset so mobile can consume the same values; only the content globs, which
// are inherently app-specific, live here.
const config: Config = {
  presets: [preset],
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};

export default config;
