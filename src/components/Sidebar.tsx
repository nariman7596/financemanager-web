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

const NAV = [
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

type HouseholdOption = {
  householdId: string;
  name: string;
  role: string;
  baseCurrency: string;
  memberCount: number;
};

export function Sidebar({
  userName,
  role,
  activeHouseholdId,
  households,
  pendingInvites = 0,
}: {
  userName?: string | null;
  role: string;
  activeHouseholdId: string;
  households: HouseholdOption[];
  pendingInvites?: number;
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-e border-[var(--border)] bg-[var(--card)] h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-[var(--border)]">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand-600 text-white">
          <Wallet size={18} />
        </span>
        <span className="font-semibold">{t("app.name")}</span>
      </div>

      <HouseholdSwitcher households={households} activeId={activeHouseholdId} role={role} />

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
              )}
            >
              <Icon size={18} />
              {t(labelKey)}
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
    </aside>
  );
}
