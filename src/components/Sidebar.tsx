"use client";

import { NavPanel, NavBrand, type NavProps } from "@/components/NavPanel";

/**
 * Desktop navigation: a fixed rail beside the content.
 *
 * Hidden below `md`, where MobileNav takes over. The two share NavPanel, so
 * they cannot drift apart.
 */
export function Sidebar(props: NavProps) {
  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-e border-[var(--border)] bg-[var(--card)] h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-[var(--border)]">
        <NavBrand />
      </div>
      <NavPanel {...props} />
    </aside>
  );
}
