import type { TFunc } from "@financemanager/i18n/translate";
import type { Locale } from "@financemanager/i18n/config";
import type { BillStatus } from "@financemanager/core/bills";
import { formatDate } from "@financemanager/core/money";

/** A bill's standing in words: "paid on …", "2 days late", "due today", "in 3 days", "on …". */
export function billStatusText(t: TFunc, s: BillStatus, locale: Locale): string {
  switch (s.state) {
    case "paid":
      return t("bills.paidOn", { date: formatDate(s.paidOn!, locale) });
    case "overdue":
      return t("bills.late", { days: -s.days });
    case "today":
      return t("bills.dueToday");
    case "soon":
      return t("bills.dueIn", { days: s.days });
    default:
      return t("bills.dueOn", { date: formatDate(s.due, locale) });
  }
}

export const BILL_STATE_CLASS: Record<BillStatus["state"], string> = {
  paid: "text-emerald-600",
  overdue: "text-red-600",
  today: "text-amber-600",
  soon: "text-amber-600",
  later: "text-slate-400",
};
