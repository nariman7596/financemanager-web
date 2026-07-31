"use client";

import { useEffect, useState } from "react";

/**
 * Tracks whether the `dark` class is on <html>, updating live when the
 * ThemeToggle flips it (via a MutationObserver). Used to theme Recharts, whose
 * SVG colors can't be driven by CSS variables.
 */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

/** Chart palette for the current theme. */
export function chartTheme(dark: boolean) {
  return dark
    ? {
        grid: "#1f2a3b",
        axis: "#93a3b8",
        tooltipBg: "#111827",
        tooltipBorder: "#1f2a3b",
        tooltipText: "#e5e7eb",
      }
    : {
        grid: "#eef2f7",
        axis: "#64748b",
        tooltipBg: "#ffffff",
        tooltipBorder: "#e6eaf0",
        tooltipText: "#0f172a",
      };
}
