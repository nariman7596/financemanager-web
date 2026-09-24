import { formatMoney } from "@financemanager/core/money";
import type { BudgetLevel } from "@financemanager/core/budgets";
import type { TFunc } from "@financemanager/i18n/translate";

/**
 * One budget: the bar, and a line that says what to do with it — how much is
 * left per day, where the current pace ends up, or how far over it went.
 */
export function BudgetBar({
  budget,
  t,
  showPace = true,
}: {
  budget: {
    category: string;
    color: string;
    currency: string;
    limit: number;
    spent: number;
    pct: number;
    level: BudgetLevel;
    remaining: number;
    projected: number;
    paceWarning: boolean;
    perDayLeft: number | null;
    daysLeft: number;
  };
  t: TFunc;
  /** Off for a period that is already over (a past month's summary). */
  showPace?: boolean;
}) {
  const barColor =
    budget.level === "over" ? "#ef4444" : budget.level === "watch" ? "#f59e0b" : budget.color;
  const money = (n: number) => formatMoney(n, budget.currency);

  let line: { text: string; className: string } | null = null;
  if (budget.level === "over") {
    line = { text: t("budgets.overAmount", { amount: money(budget.spent - budget.limit) }), className: "text-red-500" };
  } else if (showPace && budget.daysLeft > 0) {
    const pace = budget.paceWarning;
    line = {
      text: pace
        ? t("budgets.pace", { amount: money(budget.projected) })
        : t("budgets.left", {
            amount: money(budget.remaining),
            perDay: money(budget.perDayLeft ?? 0),
            days: budget.daysLeft,
          }),
      className: pace ? "text-amber-600 dark:text-amber-400" : "text-slate-400",
    };
  } else if (!showPace) {
    line = { text: t("budgets.leftOver", { amount: money(budget.remaining) }), className: "text-slate-400" };
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm mb-1.5">
        <span className="font-medium">{budget.category}</span>
        <span className="tabular-nums text-slate-500 text-end">
          {money(budget.spent)} / {money(budget.limit)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--subtle-strong)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, budget.pct)}%`, backgroundColor: barColor }}
        />
      </div>
      {line && <p className={`text-xs mt-1 ${line.className}`}>{line.text}</p>}
    </div>
  );
}
