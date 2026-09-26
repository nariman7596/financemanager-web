import { compareCategories, pctChange } from "@financemanager/core/reports";
import { formatMoney } from "@financemanager/core/money";
import type { TFunc } from "@financemanager/i18n/translate";
import { cn } from "@/lib/utils";

// Latin digits and grouping, to match formatMoney everywhere else in the app.
export const pctFmt = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

/** Every category side by side with the previous period (monthly and weekly summaries). */
export function CategoryComparison({
  rows,
  base,
  thisLabel,
  prev,
  label,
  t,
}: {
  rows: ReturnType<typeof compareCategories>;
  base: string;
  thisLabel: string;
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
          <th className="py-2 text-end font-normal ps-4">{thisLabel}</th>
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
export function Change({ change, pct, t }: { change: number; pct: number | null; t: TFunc }) {
  if (change === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className={cn(change > 0 ? "text-red-600" : "text-green-600")} dir="ltr">
      {pct === null ? t("summary.new") : pctFmt.format(pct)}
    </span>
  );
}
