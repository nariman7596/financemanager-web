import { formatMoney } from "@/lib/utils";

export function BudgetBar({
  budget,
}: {
  budget: {
    category: string;
    color: string;
    currency: string;
    limit: number;
    spent: number;
    pct: number;
  };
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
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, budget.pct)}%`, backgroundColor: barColor }}
        />
      </div>
      {over && (
        <p className="text-xs text-red-500 mt-1">Over budget by {budget.pct - 100}%</p>
      )}
    </div>
  );
}
