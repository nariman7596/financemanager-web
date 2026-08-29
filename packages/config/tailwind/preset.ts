import type { Config } from "tailwindcss";

/**
 * Shared Tailwind design tokens.
 *
 * The semantic surface tokens (--bg/--card/--border/--text/--muted/…) live as
 * CSS variables in the app's globals.css with a `.dark` override, so they are
 * not repeated here — only the values Tailwind itself must know about.
 *
 * `darkMode: "class"` belongs in the preset rather than each app: the theme is
 * toggled by putting `.dark` on <html> (see ThemeToggle), and an app that
 * silently fell back to the media strategy would ignore the user's choice.
 */
const preset: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8ecdff",
          400: "#59b0ff",
          500: "#328eff",
          600: "#1b6ff5",
          700: "#1458e1",
          800: "#1747b6",
          900: "#193f8f",
        },
      },
    },
  },
  plugins: [],
};

export default preset;
