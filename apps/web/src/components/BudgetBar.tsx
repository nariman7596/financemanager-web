import { formatMoney } from "@financemanager/core/money";
import type { TFunc } from "@financemanager/i18n/translate";

export function BudgetBar({
  budget,
  t,
}: {
  budget: {
    category: string;
    color: string;
    currency: string;
    limit: number;
    spent: number;
    pct: number;
  };
  t: TFunc;
}) {
  const over = budget.pct > 100;
  const barColor = over ? "#ef4444" : budget.pct > 80 ? "#f59e0b" : budget.color;

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium">{budget.category}</span>
        <span className="tabular-nums text-slate-500">
          {formatMoney(budget.spent, budget.currency)} / {formatMoney(budget.limit, budget.currency)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--subtle-strong)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, budget.pct)}%`, backgroundColor: barColor }}
        />
      </div>
      {over && (
        <p className="text-xs text-red-500 mt-1">{t("budgets.overBy", { pct: budget.pct - 100 })}</p>
      )}
    </div>
  );
}
