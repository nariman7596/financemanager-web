"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavPanel, NavBrand, type NavProps } from "@/components/NavPanel";
import { useT } from "@/lib/i18n/client";

/**
 * Navigation below `md`, where the sidebar is hidden.
 *
 * Without this the phone had no navigation at all: the sidebar is
 * `hidden md:flex` and nothing replaced it, so every page but the current one
 * was unreachable.
 *
 * A sticky bar with a drawer, positioned with logical properties (`start-0`)
 * so it opens from the correct edge in both LTR and RTL.
 */
export function MobileNav(props: NavProps) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation — the drawer would otherwise stay over the new page.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 border-b border-[var(--border)] bg-[var(--card)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("a11y.openMenu")}
          aria-expanded={open}
          className="btn-ghost -ms-2 p-2"
        >
          <Menu size={22} />
        </button>
        <NavBrand />
      </header>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("app.name")}
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-[var(--card)] border-e border-[var(--border)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-[var(--border)]">
              <NavBrand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("a11y.close")}
                className="btn-ghost p-2 -me-2"
              >
                <X size={20} />
              </button>
            </div>
            <NavPanel {...props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
