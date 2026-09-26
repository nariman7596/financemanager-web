import Link from "next/link";
import { Repeat as RepeatIcon, TrendingUp, Zap } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getBaseCurrency } from "@/lib/queries";
import { getInsights } from "@/lib/insights";
import { formatDate, formatMoney } from "@financemanager/core/money";
import { monthNameIn } from "@financemanager/core/calendar";
import { Topbar } from "@/components/Topbar";
import { pctFmt } from "@/components/CategoryComparison";
import { getT, getLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UNCATEGORIZED = "#64748b";

export default async function InsightsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const { windows, repeats, rising, unusual, categories, billMatches } = await getInsights(ctx.householdId, base, locale);

  const cat = (id: string | null) => (id ? categories.get(id) : undefined);
  const catName = (id: string | null) => cat(id)?.name ?? t("txnForm.uncategorized");
  const active = repeats.filter((r) => r.active);
  const stopped = repeats.filter((r) => !r.active);
  const perMonth = active.reduce((s, r) => s + r.perMonth, 0);
  const monthLabels = windows.map((w) => monthNameIn(w.start, locale));

  return (
    <>
      <Topbar title={t("insights.title")} subtitle={t("insights.subtitle")} />

      <section className="card p-5 mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-1">
          <h2 className="font-semibold flex items-center gap-2">
            <RepeatIcon size={16} className="text-slate-400" /> {t("insights.repeatTitle")}
          </h2>
          {active.length > 0 && (
            <span className="text-sm">
              {t("insights.repeatTotal", { month: formatMoney(perMonth, base), year: formatMoney(perMonth * 12, base) })}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">{t("insights.repeatHint")}</p>
        {repeats.length === 0 ? (
          <p className="text-sm text-slate-400">{t("insights.repeatNone")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400">
                  <th className="py-2 text-start font-normal">{t("insights.colWhat")}</th>
                  <th className="py-2 text-end font-normal ps-4 hidden sm:table-cell">{t("insights.colEach")}</th>
                  <th className="py-2 text-end font-normal ps-4">{t("insights.colYear")}</th>
                  <th className="py-2 text-end font-normal ps-4 hidden sm:table-cell">{t("insights.colLast")}</th>
                </tr>
              </thead>
              <tbody>
                {[...active, ...stopped].map((r) => (
                  <tr key={r.match} className={cn("border-t border-[var(--border)]", !r.active && "text-slate-400")}>
                    <td className="py-2">
                      <bdi className="font-medium">{r.label}</bdi>
                      <span className="block text-xs text-slate-400">
                        <span className="sm:hidden">{formatMoney(r.amount, base)}{locale === "fa" ? "، " : ", "}</span>
                        {t(r.period === "WEEKLY" ? "insights.weekly" : "insights.monthly", { count: r.count })}
                        {" — "}
                        {catName(r.categoryId)}
                        {!r.active && <span className="badge ms-2">{t("insights.stopped")}</span>}
                        {r.active && r.period === "MONTHLY" && !billMatches.has(r.match) && (
                          <Link href="/bills" className="ms-2 text-brand-600 hover:underline underline-offset-2">
                            {t("insights.makeBill")}
                          </Link>
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-end tabular-nums whitespace-nowrap ps-4 hidden sm:table-cell">{formatMoney(r.amount, base)}</td>
                    <td className="py-2 text-end tabular-nums whitespace-nowrap ps-4 font-medium">{formatMoney(r.perYear, base)}</td>
                    <td className="py-2 text-end whitespace-nowrap ps-4 text-xs text-slate-400 hidden sm:table-cell">{formatDate(r.last, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5 mb-6">
        <h2 className="font-semibold flex items-center gap-2 mb-1">
          <TrendingUp size={16} className="text-slate-400" /> {t("insights.risingTitle")}
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          {t("insights.risingHint", { from: monthLabels[0], to: monthLabels[5], mid: monthLabels[3] })}
        </p>
        {rising.length === 0 ? (
          <p className="text-sm text-slate-400">{t("insights.risingNone")}</p>
        ) : (
          <ul className="space-y-4">
            {rising.map((c) => {
              const max = Math.max(...c.months, 1);
              return (
                <li key={c.categoryId} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="inline-flex items-center gap-2 min-w-[8rem] flex-1">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat(c.categoryId)?.color ?? UNCATEGORIZED }} />
                    <bdi className="font-medium">{catName(c.categoryId)}</bdi>
                  </span>
                  {/* Six months, oldest at the start; the last three are the ones compared. */}
                  <span className="flex items-end gap-1 h-8" aria-hidden>
                    {c.months.map((v, i) => (
                      <span
                        key={i}
                        title={`${monthLabels[i]}: ${formatMoney(v, base)}`}
                        className={cn("w-3 rounded-t", i >= 3 ? "bg-red-400/80" : "bg-slate-300 dark:bg-slate-600")}
                        style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                      />
                    ))}
                  </span>
                  <span className="text-sm tabular-nums text-end">
                    <span className="text-slate-400">{formatMoney(c.before, base)}</span>
                    {locale === "fa" ? " ← " : " → "}
                    <span className="font-medium">{formatMoney(c.recent, base)}</span>
                    <span className="block text-xs text-red-600" dir="ltr">
                      {c.pct === null ? t("summary.new") : pctFmt.format(c.pct)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1">
          <Zap size={16} className="text-slate-400" /> {t("insights.unusualTitle")}
        </h2>
        <p className="text-xs text-slate-400 mb-4">{t("insights.unusualHint")}</p>
        {unusual.length === 0 ? (
          <p className="text-sm text-slate-400">{t("insights.unusualNone")}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {unusual.map(({ expense: x, usual, times }) => (
              <li key={x.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    <bdi>{x.description || catName(x.categoryId)}</bdi>
                  </p>
                  {/* Separate spans, not " · ": a middle dot beside a Persian digit reads as ۰. */}
                  <p className="text-xs text-slate-400 flex flex-wrap gap-x-2">
                    <span>{formatDate(x.day, locale)}</span>
                    <span aria-hidden className="text-slate-300">|</span>
                    <span>{catName(x.categoryId)}</span>
                    <span aria-hidden className="text-slate-300">|</span>
                    <span>{t("insights.usual", { amount: formatMoney(usual, base) })}</span>
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="tabular-nums text-red-600">{formatMoney(x.amount, base)}</p>
                  <p className="text-xs text-slate-400">{t("insights.times", { times: times.toFixed(1) })}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
