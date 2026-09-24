import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import {
  getBaseCurrency,
  getFlowInRange,
  getCategoryBreakdown,
  getTopExpenses,
} from "@/lib/queries";
import {
  startOfMonthIn,
  endOfMonthIn,
  subMonthsIn,
  addMonthsIn,
  monthKeyIn,
  monthKeyToDate,
} from "@financemanager/core/calendar";
import { compareCategories, pctChange, previousWindow } from "@financemanager/core/reports";
import { formatDate, formatMoney } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { getT, getLocale } from "@/lib/i18n/server";
import type { TFunc } from "@financemanager/i18n/translate";
import type { Locale } from "@financemanager/i18n/config";
import { cn } from "@/lib/utils";
import { defaultSummaryMonth } from "@/lib/monthSummary";

export const dynamic = "force-dynamic";

/** "Mehr 1405" / "October 2026". Assembled by hand: fa-IR's own pattern puts the year first. */
function monthTitle(date: Date, locale: Locale): string {
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  const year = new Intl.DateTimeFormat(tag, { year: "numeric", timeZone: "UTC" })
    .formatToParts(date)
    .find((p) => p.type === "year")?.value;
  return `${monthName(date, locale)} ${year ?? ""}`.trim();
}

function monthName(date: Date, locale: Locale): string {
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  return new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" }).format(date);
}

// Latin digits and grouping, to match formatMoney everywhere else in the app.
const pctFmt = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

export default async function MonthSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const sp = await searchParams;

  const now = new Date();
  const currentKey = monthKeyIn(now, locale);
  // A key from the URL, if it is well-formed and not in the future.
  let key = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : defaultSummaryMonth(now, locale).key;
  if (key > currentKey) key = currentKey;

  const start = startOfMonthIn(monthKeyToDate(key, locale), locale);
  const end = endOfMonthIn(start, locale);
  const prevStart = startOfMonthIn(subMonthsIn(start, 1, locale), locale);
  const prevEnd = endOfMonthIn(prevStart, locale);
  const window = previousWindow(start, end, prevStart, prevEnd, now);
  const rangeEnd = window.partial ? now : end;

  const [flow, prevFlow, categories, prevCategories, top, unreviewed] = await Promise.all([
    getFlowInRange(ctx.householdId, base, start, rangeEnd),
    getFlowInRange(ctx.householdId, base, window.start, window.end),
    getCategoryBreakdown(ctx.householdId, base, start, rangeEnd),
    getCategoryBreakdown(ctx.householdId, base, window.start, window.end),
    getTopExpenses(ctx.householdId, base, start, rangeEnd),
    prisma.transaction.count({
      where: { householdId: ctx.householdId, needsReview: true, date: { gte: start, lte: rangeEnd } },
    }),
  ]);

  // Uncategorized rows come back under a fixed English name from the query.
  const label = (name: string) => (name === "Uncategorized" ? t("txnForm.uncategorized") : name);
  const rows = compareCategories(categories, prevCategories);
  const prev = monthName(prevStart, locale);
  const prevHasData = prevFlow.income !== 0 || prevFlow.expense !== 0;

  const vs = (current: number, previous: number) => {
    if (!prevHasData) return t("summary.noPrev", { prev });
    const p = pctChange(current, previous);
    return p === null ? t("summary.newVsPrev", { prev }) : t("summary.vsPrev", { pct: pctFmt.format(p), prev });
  };

  const prevKey = monthKeyIn(prevStart, locale);
  const nextKey = monthKeyIn(addMonthsIn(start, 1, locale), locale);
  const isCurrent = key === currentKey;

  return (
    <>
      <Topbar
        title={t("summary.title", { month: monthTitle(start, locale) })}
        subtitle={window.partial ? t("summary.soFar", { prev }) : t("summary.full", { prev })}
        action={
          <div className="flex items-center gap-2">
            {/* Arrows follow reading direction: "back in time" points to the start side. */}
            <Link href={`/reports/month?m=${prevKey}`} className="btn-ghost border border-[var(--border)]" title={t("summary.prevMonth")}>
              {locale === "fa" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {monthName(prevStart, locale)}
            </Link>
            {!isCurrent && (
              <Link href={`/reports/month?m=${nextKey}`} className="btn-ghost border border-[var(--border)]" title={t("summary.nextMonth")}>
                {monthName(addMonthsIn(start, 1, locale), locale)}
                {locale === "fa" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </Link>
            )}
          </div>
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={t("reports.income")} value={formatMoney(flow.income, base)} tone="positive" hint={vs(flow.income, prevFlow.income)} />
        <StatCard label={t("reports.expenses")} value={formatMoney(flow.expense, base)} tone="negative" hint={vs(flow.expense, prevFlow.expense)} />
        <StatCard
          label={t("reports.net")}
          value={formatMoney(flow.net, base)}
          tone={flow.net >= 0 ? "positive" : "negative"}
          hint={prevHasData ? t("summary.prevNet", { prev, amount: formatMoney(prevFlow.net, base) }) : undefined}
        />
      </section>

      {unreviewed > 0 && (
        <Link
          href="/review"
          className="flex items-center gap-2 mb-6 rounded-lg px-4 py-3 text-sm bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <Inbox size={16} /> {t("summary.needsReview", { count: unreviewed })}
        </Link>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2 overflow-x-auto">
          <h2 className="font-semibold mb-4">{t("summary.byCategory")}</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">{t("summary.empty")}</p>
          ) : (
            <CategoryComparison rows={rows} base={base} prev={prev} label={label} t={t} />
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4">{t("summary.topExpenses")}</h2>
          {top.length === 0 ? (
            <p className="text-sm text-slate-400">{t("summary.empty")}</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {top.map((x) => (
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

function CategoryComparison({
  rows,
  base,
  prev,
  label,
  t,
}: {
  rows: ReturnType<typeof compareCategories>;
  base: string;
  prev: string;
  label: (name: string) => string;
  t: TFunc;
}) {
  const total = rows.reduce((s, r) => s + r.current, 0);
  const prevTotal = rows.reduce((s, r) => s + r.previous, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-400">
          <th className="py-2 text-start font-normal">{t("summary.colCategory")}</th>
          <th className="py-2 text-end font-normal ps-4">{t("summary.colThis")}</th>
          <th className="py-2 text-end font-normal ps-4 hidden sm:table-cell">{prev}</th>
          <th className="py-2 text-end font-normal ps-4">{t("summary.colChange")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-[var(--border)]">
            <td className="py-2">
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                {label(r.name)}
              </span>
            </td>
            <td className="py-2 text-end tabular-nums font-medium whitespace-nowrap ps-4">{formatMoney(r.current, base)}</td>
            <td className="py-2 text-end tabular-nums text-[var(--muted)] whitespace-nowrap ps-4 hidden sm:table-cell">{formatMoney(r.previous, base)}</td>
            <td className="py-2 text-end tabular-nums whitespace-nowrap ps-4">
              <Change change={r.change} pct={r.changePct} t={t} />
            </td>
          </tr>
        ))}
        <tr className="border-t border-[var(--border)] font-semibold">
          <td className="py-2">{t("reports.total")}</td>
          <td className="py-2 text-end tabular-nums whitespace-nowrap ps-4">{formatMoney(total, base)}</td>
          <td className="py-2 text-end tabular-nums whitespace-nowrap ps-4 hidden sm:table-cell">{formatMoney(prevTotal, base)}</td>
          <td className="py-2 text-end tabular-nums whitespace-nowrap ps-4">
            <Change change={total - prevTotal} pct={pctChange(total, prevTotal)} t={t} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Spending change: up is red, down is green. */
function Change({ change, pct, t }: { change: number; pct: number | null; t: TFunc }) {
  if (change === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className={cn(change > 0 ? "text-red-600" : "text-green-600")} dir="ltr">
      {pct === null ? t("summary.new") : pctFmt.format(pct)}
    </span>
  );
}
