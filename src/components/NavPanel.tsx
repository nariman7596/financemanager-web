"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Repeat,
  PiggyBank,
  TrendingUp,
  Wallet,
  BarChart3,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HouseholdSwitcher } from "@/components/HouseholdSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/transactions", labelKey: "nav.transactions", icon: ArrowLeftRight },
  { href: "/recurring", labelKey: "nav.recurring", icon: Repeat },
  { href: "/budgets", labelKey: "nav.budgets", icon: PiggyBank },
  { href: "/investments", labelKey: "nav.investments", icon: TrendingUp },
  { href: "/accounts", labelKey: "nav.accounts", icon: Wallet },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3 },
  { href: "/household", labelKey: "nav.household", icon: Users },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export type HouseholdOption = {
  householdId: string;
  name: string;
  role: string;
  baseCurrency: string;
  memberCount: number;
};

export type NavProps = {
  userName?: string | null;
  role: string;
  activeHouseholdId: string;
  households: HouseholdOption[];
  pendingInvites?: number;
};

/**
 * The navigation itself, with no opinion about where it sits.
 *
 * Rendered twice: as the fixed sidebar on desktop, and inside the mobile
 * drawer. Sharing one component is what keeps the two from drifting — a nav
 * item added here shows up in both.
 */
export function NavPanel({
  userName,
  role,
  activeHouseholdId,
  households,
  pendingInvites = 0,
  onNavigate,
}: NavProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <>
      <HouseholdSwitcher households={households} activeId={activeHouseholdId} role={role} />

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                // min-h-11 keeps every row at a comfortable touch target on a
                // phone; on a mouse it is the same visual height as before.
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{t(labelKey)}</span>
              {href === "/household" && pendingInvites > 0 && (
                <span className="ms-auto badge bg-brand-600 text-white">{pendingInvites}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-3 space-y-1">
        <div className="px-3 py-2 text-sm">
          <p className="font-medium truncate">{userName ?? t("nav.account")}</p>
        </div>
        <LanguageSwitcher />
        <ThemeToggle className="w-full justify-start !border-0" />
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost w-full justify-start">
            <LogOut size={18} /> {t("nav.signOut")}
          </button>
        </form>
      </div>
    </>
  );
}

/** Brand lockup shared by the sidebar header and the mobile bar. */
export function NavBrand() {
  const t = useT();
  return (
    <span className="flex items-center gap-2">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand-600 text-white shrink-0">
        <Wallet size={18} />
      </span>
      <span className="font-semibold truncate">{t("app.name")}</span>
    </span>
  );
}
