"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Light/dark toggle. Persists the choice to localStorage; the pre-paint script
// in the root layout applies it on load (no flash).
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  // Avoid rendering the wrong icon before we've read the current theme.
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-ghost border border-[var(--border)] ${className}`}
      aria-label={label}
      title={label}
    >
      {mounted && dark ? <Sun size={16} /> : <Moon size={16} />}
      <span className="text-sm">{mounted && dark ? "Light" : "Dark"}</span>
    </button>
  );
}
