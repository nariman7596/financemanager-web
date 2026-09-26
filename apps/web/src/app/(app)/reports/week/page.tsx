import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { getBaseCurrency, getFlowInRange, getCategoryBreakdown, getTopExpenses, getBudgetProgress } from "@/lib/queries";
import {
  addWeeks,
  compareCategories,
  dailyTotals,
  defaultSummaryWeek,
  pctChange,
  previousWindow,
  weekEnd,
  weekFromKey,
  weekKey,
  weekStart,
  worthChange,
} from "@financemanager/core/reports";
import { formatDate, formatMoney } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { BudgetBar } from "@/components/BudgetBar";
import { CategoryComparison, pctFmt } from "@/components/CategoryComparison";
import { getT, getLocale } from "@/lib/i18n/server";
import { getNetWorthHistory } from "@/lib/networth";
import { getBills, localToday } from "@/lib/bills";
import { billStatusText, BILL_STATE_CLASS } from "@/lib/billText";
import type { Locale } from "@financemanager/i18n/config";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

/** "5 Mehr" / "Sep 26" — the week's ends without the year. */
function dayMonth(date: Date, locale: Locale): string {
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

function weekday(date: Date, locale: Locale, width: "short" | "narrow"): string {
  const tag = locale === "fa" ? "fa-IR" : "en-US";
  return new Intl.DateTimeFormat(tag, { weekday: width, timeZone: "UTC" }).format(date);
}

// Bare numbers over the bars: the currency is in every other figure on the page.
const barFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default async function WeekSummaryPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const sp = await searchParams;

  // Transactions are dated by the local day, so "now" is the end of today there.
  const today = localToday(locale);
  const todayEnd = new Date(today.getTime() + DAY - 1);
  const currentStart = weekStart(today, locale);
  let start = weekFromKey(sp.w, locale) ?? defaultSummaryWeek(today, locale).start;
  if (start > currentStart) start = currentStart;
  const end = weekEnd(start);
  const prevStart = addWeeks(start, -1);
  const window = previousWindow(start, end, prevStart, weekEnd(prevStart), todayEnd);
  const rangeEnd = window.partial ? todayEnd : end;
  const isCurrent = start.getTime() === currentStart.getTime();
  // What is coming up is worth showing on this week and the one just ended.
  const showUpcoming = isCurrent || start.getTime() === addWeeks(currentStart, -1).getTime();

  const [flow, prevFlow, categories, prevCategories, expenses, unreviewed, allBudgets, history, bills] = await Promise.all([
    getFlowInRange(ctx.householdId, base, start, rangeEnd),
    getFlowInRange(ctx.householdId, base, window.start, window.end),
    getCategoryBreakdown(ctx.householdId, base, start, rangeEnd),
    getCategoryBreakdown(ctx.householdId, base, window.start, window.end),
    getTopExpenses(ctx.householdId, base, start, rangeEnd, Infinity),
    prisma.transaction.count({
      where: { householdId: ctx.householdId, needsReview: true, date: { gte: start, lte: rangeEnd } },
    }),
    getBudgetProgress(ctx.householdId, rangeEnd, locale),
    getNetWorthHistory(ctx.householdId, base),
    showUpcoming ? getBills(ctx.householdId, base, locale) : null,
  ]);
  const budgets = allBudgets.filter((b) => b.period === "WEEKLY");
  const days = dailyTotals(start, expenses.map((x) => ({ day: x.date, value: x.value })));
  const maxDay = Math.max(...days.map((d) => d.value), 0);
  const worth = worthChange(history.points, start, rangeEnd);
  const upcoming = (bills?.bills ?? [])
    .filter((b) => b.active && b.status.state !== "paid" && b.status.days <= 7)
    .sort((a, b) => a.status.days - b.status.days);

  const label = (name: string) => (name === "Uncategorized" ? t("txnForm.uncategorized") : name);
  const rows = compareCategories(categories, prevCategories);
  const prev = t("week.prevLabel");
  const prevHasData = prevFlow.income !== 0 || prevFlow.expense !== 0;
  const vs = (current: number, previous: number) => {
    if (!prevHasData) return t("summary.noPrev", { prev });
    const p = pctChange(current, previous);
    return p === null ? t("summary.newVsPrev", { prev }) : t("summary.vsPrev", { pct: pctFmt.format(p), prev });
  };

  return (
    <>
      <Topbar
        title={t("week.title", { from: dayMonth(start, locale), to: dayMonth(new Date(start.getTime() + 6 * DAY), locale) })}
        subtitle={window.partial ? t("week.soFar") : t("week.full")}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/reports/week?w=${weekKey(prevStart)}`} className="btn-ghost border border-[var(--border)]">
              {locale === "fa" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {t("week.prev")}
            </Link>
            {!isCurrent && (
              <Link href={`/reports/week?w=${weekKey(addWeeks(start, 1))}`} className="btn-ghost border border-[var(--border)]">
                {t("week.next")}
                {locale === "fa" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </Link>
            )}
          </div>
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t("reports.income")} value={formatMoney(flow.income, base)} tone="positive" hint={vs(flow.income, prevFlow.income)} />
        <StatCard label={t("reports.expenses")} value={formatMoney(flow.expense, base)} tone="negative" hint={vs(flow.expense, prevFlow.expense)} />
        <StatCard
          label={t("reports.net")}
          value={formatMoney(flow.net, base)}
          tone={flow.net >= 0 ? "positive" : "negative"}
          hint={prevHasData ? t("summary.prevNet", { prev, amount: formatMoney(prevFlow.net, base) }) : undefined}
        />
        {worth && (
          <StatCard
            label={t("week.worth")}
            value={formatMoney(worth.to, base)}
            hint={t("week.worthHint", { change: (worth.change > 0 ? "+" : "") + formatMoney(worth.change, base) })}
          />
        )}
      </section>

      {unreviewed > 0 && (
        <Link
          href="/review"
          className="flex items-center gap-2 mb-6 rounded-lg px-4 py-3 text-sm bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <Inbox size={16} /> {t("week.needsReview", { count: unreviewed })}
        </Link>
      )}

      {upcoming.length > 0 && (
        <Link href="/bills" className="card p-4 mb-6 block row-hover">
          <h2 className="text-sm font-semibold mb-2">{t("week.upcoming")}</h2>
          <ul className="space-y-1.5 text-sm">
            {upcoming.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline gap-x-3">
                <bdi className="font-medium">{b.name}</bdi>
                <span className="tabular-nums text-slate-400">{formatMoney(b.amount, b.currency)}</span>
                <span className={"ms-auto text-xs " + BILL_STATE_CLASS[b.status.state]}>{billStatusText(t, b.status, locale)}</span>
              </li>
            ))}
          </ul>
        </Link>
      )}

      <section className="card p-5 mb-6">
        <h2 className="font-semibold mb-4">{t("week.daily")}</h2>
        <div className="grid grid-cols-7 gap-2 items-end h-40">
          {days.map((d) => {
            const future = d.day > today;
            return (
              <div key={d.day.toISOString()} className="flex flex-col items-center justify-end h-full gap-1 min-w-0">
                <span className="text-[10px] tabular-nums text-slate-400 truncate max-w-full" dir="ltr">
                  {d.value > 0 ? barFmt.format(d.value) : ""}
                </span>
                <div
                  className={"w-full max-w-10 rounded-t " + (future ? "bg-[var(--subtle)]" : "bg-red-400/80 dark:bg-red-400/60")}
                  style={{ height: maxDay > 0 ? `${Math.max(2, (d.value / maxDay) * 100)}%` : "2px" }}
                  title={`${formatDate(d.day, locale)}: ${formatMoney(d.value, base)}`}
                />
                <span className="text-xs text-slate-400 sm:hidden">{weekday(d.day, locale, "narrow")}</span>
                <span className="text-xs text-slate-400 hidden sm:inline">{weekday(d.day, locale, "short")}</span>
              </div>
            );
          })}
        </div>
      </section>

      {budgets.length > 0 && (
        <section className="card p-5 mb-6">
          <h2 className="font-semibold mb-4">{t("week.budgets")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {budgets.map((b) => (
              <BudgetBar key={b.id} budget={b} t={t} showPace={window.partial} />
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2 overflow-x-auto">
          <h2 className="font-semibold mb-4">{t("summary.byCategory")}</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">{t("week.empty")}</p>
          ) : (
            <CategoryComparison rows={rows} base={base} thisLabel={t("week.colThis")} prev={prev} label={label} t={t} />
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4">{t("summary.topExpenses")}</h2>
          {expenses.length === 0 ? (
            <p className="text-sm text-slate-400">{t("week.empty")}</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {expenses.slice(0, 5).map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{x.description || label(x.category ?? "Uncategorized")}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(x.date, locale)} · {label(x.category ?? "Uncategorized")}
                    </p>
                  </div>
                  <span className="tabular-nums whitespace-nowrap text-red-600">{formatMoney(x.value, base)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
