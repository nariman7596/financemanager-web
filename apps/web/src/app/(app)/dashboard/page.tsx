import { requireHousehold } from "@/lib/household";
import {
  getBaseCurrency,
  getNetWorth,
  getMonthlyFlow,
  getCashFlowSeries,
  getSpendingByCategory,
  getBudgetProgress,
  getSpendingByMember,
} from "@/lib/queries";
import { formatMoney } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { CashFlowChart, SpendingPieChart } from "@/components/Charts";
import { BudgetBar } from "@/components/BudgetBar";
import { MemberSpending } from "@/components/MemberSpending";
import { getT, getLocale } from "@/lib/i18n/server";
import { monthNameIn, monthKeyToDate, startOfMonthIn, endOfMonthIn } from "@financemanager/core/calendar";
import { defaultSummaryMonth } from "@/lib/monthSummary";
import { prisma } from "@/lib/prisma";
import { AlertTriangle, CalendarDays } from "lucide-react";
import type { TFunc } from "@financemanager/i18n/translate";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireHousehold();
  const t = await getT();
  const locale = await getLocale();
  const base = await getBaseCurrency(ctx.householdId);

  const [netWorth, flow, series, spending, budgets, byMember] = await Promise.all([
    getNetWorth(ctx.householdId, base),
    getMonthlyFlow(ctx.householdId, base, new Date(), locale),
    getCashFlowSeries(ctx.householdId, base, 6, locale),
    getSpendingByCategory(ctx.householdId, base, new Date(), locale),
    getBudgetProgress(ctx.householdId, new Date(), locale),
    getSpendingByMember(ctx.householdId, base, new Date(), locale),
  ]);

  const monthName = monthNameIn(new Date(), locale);

  // Budgets over, at 80%, or on pace to go over — worst first. The card below
  // lists the fullest ones first for the same reason.
  const rank = { over: 0, watch: 1, ok: 2 } as const;
  budgets.sort((a, b) => rank[a.level] - rank[b.level] || b.pct - a.pct);
  const alerts = budgets.filter((b) => b.level !== "ok");

  // For the first week of a month, point at the one that just ended — if
  // anything was recorded in it.
  const summary = defaultSummaryMonth(new Date(), locale);
  const endedMonth = monthKeyToDate(summary.key, locale);
  const showSummary =
    summary.justEnded &&
    (await prisma.transaction.count({
      where: {
        householdId: ctx.householdId,
        date: { gte: startOfMonthIn(endedMonth, locale), lte: endOfMonthIn(endedMonth, locale) },
      },
    })) > 0;

  return (
    <>
      <Topbar
        title={ctx.name ? t("dashboard.welcomeName", { name: ctx.name.split(" ")[0] }) : t("dashboard.welcome")}
        subtitle={t("dashboard.subtitle", { month: monthName })}
      />

      {showSummary && (
        <Link
          href={`/reports/month?m=${summary.key}`}
          className="flex items-center gap-2 mb-6 rounded-lg px-4 py-3 text-sm font-medium bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200"
        >
          <CalendarDays size={16} /> {t("summary.ready", { month: monthNameIn(endedMonth, locale) })}
        </Link>
      )}

      {alerts.length > 0 && (
        <Link
          href="/budgets"
          className="block mb-6 rounded-lg px-4 py-3 text-sm bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <p className="flex items-center gap-2 font-medium mb-1">
            <AlertTriangle size={16} /> {t("budgets.alertTitle")}
          </p>
          <ul className="space-y-0.5 ps-6">
            {alerts.map((b) => (
              <li key={b.id} className={b.level === "over" ? "text-red-600 dark:text-red-300" : undefined}>
                {/* The name is the user's own text, in any script: isolated so a
                    Latin name does not reorder the Persian around it. */}
                <bdi className="font-medium">{b.category}</bdi>
                {": "}
                {b.level === "over"
                  ? t("budgets.alertOver", { pct: b.pct })
                  : b.pct >= 80
                    ? t("budgets.alertWatch", { pct: b.pct })
                    : t("budgets.alertPace")}
              </li>
            ))}
          </ul>
        </Link>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("dashboard.netWorth")} value={formatMoney(netWorth.total, base)} hint={t("common.inCurrency", { code: base })} />
        <StatCard label={t("dashboard.income", { month: monthName })} value={formatMoney(flow.income, base)} tone="positive" />
        <StatCard label={t("dashboard.expenses", { month: monthName })} value={formatMoney(flow.expense, base)} tone="negative" />
        <StatCard
          label={t("dashboard.netThisMonth")}
          value={formatMoney(flow.net, base)}
          tone={flow.net >= 0 ? "positive" : "negative"}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold mb-4">{t("dashboard.cashFlow")}</h2>
          <CashFlowChart data={series} currency={base} />
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4">{t("dashboard.spendingByCategory")}</h2>
          <SpendingPieChart data={spending} currency={base} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t("dashboard.assets")}</h2>
          </div>
          <div className="space-y-3 text-sm">
            <Row t={t} label={t("dashboard.cashAccounts")} value={formatMoney(netWorth.cash, base)} />
            <Row t={t} label={t("dashboard.investments")} value={formatMoney(netWorth.investments, base)} />
            {netWorth.heldForOthers > 0 && (
              <p className="flex justify-between text-xs text-slate-400">
                <span>{t("dashboard.heldForOthers")}</span>
                <span className="tabular-nums">{formatMoney(netWorth.heldForOthers, base)}</span>
              </p>
            )}
            <div className="border-t border-[var(--border)] pt-3">
              <Row t={t} label={t("dashboard.totalNetWorth")} value={formatMoney(netWorth.total, base)} bold />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t("dashboard.budgets")}</h2>
            <Link href="/budgets" className="text-sm text-brand-600 hover:underline">{t("common.manage")}</Link>
          </div>
          {budgets.length === 0 ? (
            <p className="text-sm text-slate-400">
              {t("dashboard.noBudgets")}{" "}
              <Link href="/budgets" className="text-brand-600 hover:underline">{t("dashboard.setOneUp")}</Link>.
            </p>
          ) : (
            <div className="space-y-4">
              {budgets.slice(0, 5).map((b) => (
                <BudgetBar key={b.id} budget={b} t={t} />
              ))}
            </div>
          )}
        </div>
      </section>

      {byMember.members > 1 && (
        <section className="mt-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{t("dashboard.spendingByMember", { month: monthName })}</h2>
              <span className="text-sm text-slate-400">{t("dashboard.whoSpentWhat")}</span>
            </div>
            <MemberSpending rows={byMember.rows} currency={base} t={t} />
          </div>
        </section>
      )}
    </>
  );
}

function Row({ label, value, bold }: { t: TFunc; label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-medium" : "text-[var(--muted)]"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
