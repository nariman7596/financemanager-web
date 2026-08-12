import { Download } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import {
  getBaseCurrency,
  getFlowInRange,
  getSeriesInRange,
  getCategoryBreakdown,
  getMemberBreakdown,
} from "@/lib/queries";
import { resolveRange } from "@/lib/dateRange";
import { formatDate, formatMoney } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { CashFlowChart, SpendingPieChart } from "@/components/Charts";
import { MemberSpending } from "@/components/MemberSpending";
import { DateRangePicker } from "@/components/DateRangePicker";
import { getT, getLocale } from "@/lib/i18n/server";
import type { TFunc } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const sp = await searchParams;
  const range = resolveRange(sp);

  const [flow, series, categories, byMember] = await Promise.all([
    getFlowInRange(ctx.householdId, base, range.start, range.end),
    getSeriesInRange(ctx.householdId, base, range.start, range.end),
    getCategoryBreakdown(ctx.householdId, base, range.start, range.end),
    getMemberBreakdown(ctx.householdId, base, range.start, range.end),
  ]);

  const totalExpense = categories.reduce((s, c) => s + c.value, 0);
  const rangeQuery = `from=${range.fromStr}&to=${range.toStr}`;

  return (
    <>
      <Topbar
        title={t("reports.title")}
        subtitle={
          range.preset === "custom"
            ? `${formatDate(range.start, locale)} – ${formatDate(range.end, locale)}`
            : t(range.labelKey)
        }
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/api/export/report?${rangeQuery}`}
              className="btn-ghost border border-[var(--border)]"
              title={t("reports.summaryTitle")}
            >
              <Download size={16} /> {t("reports.summary")}
            </a>
            <a
              href={`/api/export/transactions?${rangeQuery}`}
              className="btn-ghost border border-[var(--border)]"
              title={t("reports.transactionsTitle")}
            >
              <Download size={16} /> {t("reports.transactions")}
            </a>
          </div>
        }
      />

      <div className="card p-5 mb-6">
        <DateRangePicker preset={range.preset} fromStr={range.fromStr} toStr={range.toStr} />
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={t("reports.income")} value={formatMoney(flow.income, base)} tone="positive" />
        <StatCard label={t("reports.expenses")} value={formatMoney(flow.expense, base)} tone="negative" />
        <StatCard label={t("reports.net")} value={formatMoney(flow.net, base)} tone={flow.net >= 0 ? "positive" : "negative"} />
      </section>

      <section className="card p-5 mb-6">
        <h2 className="font-semibold mb-4">{t("reports.incomeVsExpense")}</h2>
        <CashFlowChart data={series} currency={base} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">{t("reports.spendingByCategory")}</h2>
          <SpendingPieChart data={categories} currency={base} />
        </div>
        {byMember.members > 1 ? (
          <div className="card p-5">
            <h2 className="font-semibold mb-4">{t("reports.spendingByMember")}</h2>
            <MemberSpending rows={byMember.rows} currency={base} t={t} />
          </div>
        ) : (
          <div className="card p-5">
            <h2 className="font-semibold mb-4">{t("reports.categoryDetail")}</h2>
            <CategoryTable categories={categories} total={totalExpense} base={base} t={t} />
          </div>
        )}
      </section>

      {byMember.members > 1 && categories.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-4">{t("reports.categoryDetail")}</h2>
          <CategoryTable categories={categories} total={totalExpense} base={base} t={t} />
        </section>
      )}
    </>
  );
}

function CategoryTable({
  categories,
  total,
  base,
  t,
}: {
  categories: { name: string; color: string; value: number }[];
  total: number;
  base: string;
  t: TFunc;
}) {
  if (categories.length === 0) {
    return <p className="text-sm text-slate-400">{t("reports.noSpending")}</p>;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {categories.map((c) => (
          <tr key={c.name} className="border-t border-[var(--border)] first:border-0">
            <td className="py-2">
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </span>
            </td>
            <td className="py-2 text-right tabular-nums text-[var(--muted)]">
              {total > 0 ? Math.round((c.value / total) * 100) : 0}%
            </td>
            <td className="py-2 text-right tabular-nums font-medium whitespace-nowrap pl-4">
              {formatMoney(c.value, base)}
            </td>
          </tr>
        ))}
        <tr className="border-t border-[var(--border)]">
          <td className="py-2 font-medium">{t("reports.total")}</td>
          <td></td>
          <td className="py-2 text-right tabular-nums font-semibold whitespace-nowrap pl-4">
            {formatMoney(total, base)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
