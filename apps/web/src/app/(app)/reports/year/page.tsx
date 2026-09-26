import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getBaseCurrency } from "@/lib/queries";
import { defaultReportYear, getYearReport } from "@/lib/yearReport";
import { localToday } from "@/lib/bills";
import { compareCategories, pctChange, savingsRate, yearOf } from "@financemanager/core/reports";
import { formatDate, formatMoney, signedMoney } from "@financemanager/core/money";
import { monthNameIn } from "@financemanager/core/calendar";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { CategoryComparison, pctFmt } from "@/components/CategoryComparison";
import { getT, getLocale } from "@/lib/i18n/server";
import type { Locale } from "@financemanager/i18n/config";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** "۱۴۰۵" / "2026" — no grouping. */
function yearLabel(year: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { useGrouping: false }).format(year);
}

const rateFmt = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

const shortFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * A bare compact number ("1.2B", "−899K") for a phone, where four columns of
 * toman do not fit; the currency is on every card above. Sign and digits are
 * kept together left-to-right (see signedMoney).
 */
function short(n: number, signed = false): string {
  const text = shortFmt.format(Math.abs(n));
  const sign = n < 0 ? "\u2212" : signed && n > 0 ? "+" : "";
  return sign ? "\u2066" + sign + text + "\u2069" : text;
}

/** Full on wider screens, a bare compact number on a phone. */
function Money({ value, base }: { value: number; base: string }) {
  return (
    <>
      <span className="sm:hidden">{short(value)}</span>
      <span className="hidden sm:inline">{formatMoney(value, base)}</span>
    </>
  );
}

export default async function YearReportPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const sp = await searchParams;

  const current = yearOf(localToday(locale), locale);
  let year = /^\d{4}$/.test(sp.y ?? "") ? Number(sp.y) : defaultReportYear(locale);
  if (year > current) year = current;
  const r = await getYearReport(ctx.householdId, base, locale, year);

  const label = (name: string) => (name === "Uncategorized" ? t("txnForm.uncategorized") : name);
  const prev = t("year.prevLabel");
  const prevHasData = r.prevFlow.income !== 0 || r.prevFlow.expense !== 0;
  const vs = (current: number, previous: number) => {
    if (!prevHasData) return t("summary.noPrev", { prev });
    const p = pctChange(current, previous);
    return p === null ? t("summary.newVsPrev", { prev }) : t("summary.vsPrev", { pct: pctFmt.format(p), prev });
  };
  const rate = savingsRate(r.flow.income, r.flow.expense);
  const prevRate = savingsRate(r.prevFlow.income, r.prevFlow.expense);
  const rows = compareCategories(r.categories, r.prevCategories);
  const maxMonth = Math.max(...r.months.map((m) => Math.max(m.income, m.expense)), 1);
  const holdingsValue = r.holdings.reduce((s, h) => s + h.value, 0);
  const holdingsCost = r.holdings.reduce((s, h) => s + h.cost, 0);

  return (
    <>
      <Topbar
        title={t("year.title", { year: yearLabel(year, locale) })}
        subtitle={r.partial ? t("year.soFar") : t("year.full")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/reports/year?y=${year - 1}`} className="btn-ghost border border-[var(--border)]">
              {locale === "fa" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {yearLabel(year - 1, locale)}
            </Link>
            {year < current && (
              <Link href={`/reports/year?y=${year + 1}`} className="btn-ghost border border-[var(--border)]">
                {yearLabel(year + 1, locale)}
                {locale === "fa" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </Link>
            )}
            <a href={`/api/export/year?y=${year}`} className="btn-ghost border border-[var(--border)]">
              <Download size={16} /> {t("year.export")}
            </a>
          </div>
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label={t("reports.income")} value={formatMoney(r.flow.income, base)} tone="positive" hint={vs(r.flow.income, r.prevFlow.income)} />
        <StatCard label={t("reports.expenses")} value={formatMoney(r.flow.expense, base)} tone="negative" hint={vs(r.flow.expense, r.prevFlow.expense)} />
        <StatCard
          label={t("reports.net")}
          value={formatMoney(r.flow.net, base)}
          tone={r.flow.net >= 0 ? "positive" : "negative"}
          hint={prevHasData ? t("summary.prevNet", { prev, amount: formatMoney(r.prevFlow.net, base) }) : undefined}
        />
        <StatCard
          label={t("year.savingsRate")}
          value={rate === null ? "—" : rateFmt.format(rate)}
          tone={rate === null ? "default" : rate >= 0 ? "positive" : "negative"}
          hint={prevRate !== null && prevHasData ? t("year.prevRate", { prev, rate: rateFmt.format(prevRate) }) : t("year.rateHint")}
        />
        {r.worth && (
          <StatCard
            label={t("year.worth")}
            value={formatMoney(r.worth.to, base)}
            hint={
              r.worth.since
                ? t("year.worthSince", { change: signedMoney(r.worth.change, base), date: formatDate(r.worth.since, locale) })
                : t("year.worthChange", { change: signedMoney(r.worth.change, base) })
            }
          />
        )}
        <StatCard
          label={t("year.realized")}
          value={signedMoney(r.realized.gain, base)}
          tone={r.realized.gain > 0 ? "positive" : r.realized.gain < 0 ? "negative" : "default"}
          hint={t("year.realizedHint", { count: r.realized.count })}
        />
      </section>

      <section className="card p-5 mb-6 overflow-x-auto">
        <h2 className="font-semibold mb-4">{t("year.byMonth")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="py-2 text-start font-normal">{t("year.colMonth")}</th>
              <th className="py-2 font-normal w-1/3 hidden sm:table-cell" />
              <th className="py-2 text-end font-normal ps-3 sm:ps-4">{t("reports.income")}</th>
              <th className="py-2 text-end font-normal ps-3 sm:ps-4">{t("reports.expenses")}</th>
              <th className="py-2 text-end font-normal ps-3 sm:ps-4">{t("reports.net")}</th>
            </tr>
          </thead>
          <tbody>
            {r.months.map((m, i) => {
              const future = r.windows[i].start > r.today;
              return (
                <tr key={i} className={cn("border-t border-[var(--border)]", future && "text-slate-300 dark:text-slate-600")}>
                  <td className="py-2">{monthNameIn(r.windows[i].start, locale)}</td>
                  {/* Income over expense, on one scale for the whole year. */}
                  <td className="py-2 hidden sm:table-cell" aria-hidden>
                    <div className="space-y-0.5">
                      <div className="h-1.5 rounded bg-green-500/70" style={{ width: `${(m.income / maxMonth) * 100}%` }} />
                      <div className="h-1.5 rounded bg-red-400/80" style={{ width: `${(m.expense / maxMonth) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-2 text-end tabular-nums whitespace-nowrap ps-3 sm:ps-4">{future ? "—" : <Money value={m.income} base={base} />}</td>
                  <td className="py-2 text-end tabular-nums whitespace-nowrap ps-3 sm:ps-4">{future ? "—" : <Money value={m.expense} base={base} />}</td>
                  <td className={cn("py-2 text-end tabular-nums whitespace-nowrap ps-3 sm:ps-4 font-medium", !future && (m.net >= 0 ? "text-green-600" : "text-red-600"))}>
                    {future ? "—" : <Money value={m.net} base={base} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2 overflow-x-auto">
          <h2 className="font-semibold mb-4">{t("summary.byCategory")}</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">{t("year.empty")}</p>
          ) : (
            <CategoryComparison rows={rows} base={base} thisLabel={t("year.colThis")} prev={prev} label={label} t={t} />
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4">{t("summary.topExpenses")}</h2>
          {r.top.length === 0 ? (
            <p className="text-sm text-slate-400">{t("year.empty")}</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {r.top.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{x.description || label(x.category ?? "Uncategorized")}</p>
                    {/* Separate spans, not " · ": a middle dot beside a Persian digit reads as ۰. */}
                    <p className="text-xs text-slate-400 flex flex-wrap gap-x-2">
                      <span>{formatDate(x.date, locale)}</span>
                      <span aria-hidden className="text-slate-300">|</span>
                      <span>{label(x.category ?? "Uncategorized")}</span>
                    </p>
                  </div>
                  <span className="tabular-nums whitespace-nowrap text-red-600">{formatMoney(x.value, base)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {r.holdings.length > 0 && (
        <section className="card p-5 overflow-x-auto">
          <h2 className="font-semibold mb-1">{t("year.holdings")}</h2>
          <p className="text-xs text-slate-400 mb-4">{t("year.holdingsHint")}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="py-2 text-start font-normal">{t("inv.colSymbol")}</th>
                <th className="py-2 text-end font-normal ps-4">{t("inv.colValue")}</th>
                <th className="py-2 text-end font-normal ps-4 hidden sm:table-cell">{t("inv.totalCost")}</th>
                <th className="py-2 text-end font-normal ps-4">{t("inv.colGain")}</th>
              </tr>
            </thead>
            <tbody>
              {[...r.holdings, { id: "total", symbol: t("reports.total"), name: "", value: holdingsValue, cost: holdingsCost }].map((h) => {
                // A gain too small to show is none: no "−0" in red.
                const gain = signedMoney(h.value - h.cost, base) === formatMoney(0, base) ? 0 : h.value - h.cost;
                return (
                  <tr key={h.id} className={cn("border-t border-[var(--border)]", h.id === "total" && "font-semibold")}>
                    <td className="py-2">
                      <bdi>{h.symbol}</bdi>
                      {h.name && h.name !== h.symbol && <span className="block text-xs text-slate-400 truncate max-w-[8rem] sm:max-w-[14rem]">{h.name}</span>}
                    </td>
                    <td className="py-2 text-end tabular-nums whitespace-nowrap ps-3 sm:ps-4"><Money value={h.value} base={base} /></td>
                    <td className="py-2 text-end tabular-nums whitespace-nowrap ps-3 sm:ps-4 hidden sm:table-cell">{formatMoney(h.cost, base)}</td>
                    <td className={cn("py-2 text-end tabular-nums whitespace-nowrap ps-3 sm:ps-4", gain > 0 ? "text-green-600" : gain < 0 ? "text-red-600" : "text-slate-400")}>
                      <span className="sm:hidden">{short(gain, true)}</span>
                      <span className="hidden sm:inline">{signedMoney(gain, base)}</span>
                      {h.cost > 0 && <span className="block text-xs" dir="ltr">{pctFmt.format(gain / h.cost)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
