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
  Settings,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ userName }: { userName?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-[var(--border)] bg-white h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-[var(--border)]">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand-600 text-white">
          <Wallet size={18} />
        </span>
        <span className="font-semibold">FinanceManager</span>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <div className="px-3 py-2 text-sm">
          <p className="font-medium truncate">{userName ?? "Account"}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost w-full justify-start">
            <LogOut size={18} /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
