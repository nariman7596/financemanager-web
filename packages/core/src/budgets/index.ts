import {
  endOfMonthIn,
  endOfWeekIn,
  endOfYearIn,
  startOfMonthIn,
  startOfWeekIn,
  startOfYearIn,
} from "../calendar";
import type { Locale } from "@financemanager/i18n/config";

/**
 * Budgets: which stretch of time a budget covers, and how it is going.
 *
 * A budget's period is measured in the reader's calendar — a Persian week runs
 * Saturday to Friday, a Persian year from Nowruz — so "this month's groceries"
 * is the month the owner actually lives in. (Before this, every budget was
 * measured by month whatever its period said.)
 */

export type BudgetPeriod = "WEEKLY" | "MONTHLY" | "YEARLY";

export function budgetWindow(period: string, now: Date, locale: Locale): { start: Date; end: Date } {
  switch (period) {
    case "WEEKLY":
      return { start: startOfWeekIn(now, locale), end: endOfWeekIn(now, locale) };
    case "YEARLY":
      return { start: startOfYearIn(now, locale), end: endOfYearIn(now, locale) };
    default:
      return { start: startOfMonthIn(now, locale), end: endOfMonthIn(now, locale) };
  }
}

/** ok: fine · watch: 80% used, or on pace to go over · over: past the limit. */
export type BudgetLevel = "ok" | "watch" | "over";

export interface BudgetStatus {
  pct: number;
  level: BudgetLevel;
  /** What is left; 0 once over. */
  remaining: number;
  /** Spending at the pace so far, extended to the end of the period. */
  projected: number;
  /** The pace runs past the limit, and enough of the period has passed to say so. */
  paceWarning: boolean;
  /** What can still be spent per day to finish within the limit; null once over. */
  perDayLeft: number | null;
  daysLeft: number;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * How a budget stands at `now`.
 *
 * The projection needs a little of the period behind it: two days into a month
 * one grocery run extrapolates to a fortune. Until a fifth of the period has
 * passed, pace alone never raises a warning — only the 80% line does.
 */
export function budgetStatus(input: {
  limit: number;
  spent: number;
  start: Date;
  end: Date;
  now: Date;
}): BudgetStatus {
  const { limit, spent, start, end, now } = input;
  const total = Math.max(1, end.getTime() - start.getTime());
  const elapsed = Math.min(total, Math.max(0, now.getTime() - start.getTime()));
  const fraction = elapsed / total;
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const projected = fraction > 0 ? spent / fraction : spent;
  // Today counts as a day left: spending today is still to come.
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY));
  const remaining = Math.max(0, limit - spent);

  const paceWarning = limit > 0 && spent <= limit && fraction >= 0.2 && projected > limit;
  let level: BudgetLevel = "ok";
  if (limit > 0 && spent > limit) level = "over";
  else if (limit > 0 && (spent >= 0.8 * limit || paceWarning)) level = "watch";

  return {
    pct,
    level,
    remaining,
    projected: Math.round(projected * 100) / 100,
    paceWarning,
    perDayLeft: level === "over" || daysLeft === 0 ? null : Math.floor(remaining / daysLeft),
    daysLeft,
  };
}
export * from "./plan";
