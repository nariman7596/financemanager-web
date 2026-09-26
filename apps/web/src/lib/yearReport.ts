import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { localToday } from "./bills";
import { getNetWorthHistory } from "./networth";
import { getRealized, realizedIn } from "./realized";
import { getCategoryBreakdown, getFlowInRange, getInvestments, getTopExpenses } from "./queries";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { monthlyFlow, monthWindows, previousWindow, worthChange, yearBounds, yearOf } from "@financemanager/core/reports";
import type { Locale } from "@financemanager/i18n/config";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Which year the report opens on: the current one, except in its first
 * three weeks (Nowruz holidays), when the year just ended is the one worth
 * reading.
 */
export function defaultReportYear(locale: Locale, today = localToday(locale)): number {
  const y = yearOf(today, locale);
  return today.getTime() - yearBounds(y, locale).start.getTime() < 21 * DAY ? y - 1 : y;
}

/**
 * A year in review, in the base currency. A year in progress runs to the end
 * of today and is compared with the same stretch of the year before.
 */
export async function getYearReport(householdId: string, base: string, locale: Locale, year: number) {
  const today = localToday(locale);
  const todayEnd = new Date(today.getTime() + DAY - 1);
  const { start, end } = yearBounds(year, locale);
  const prev = yearBounds(year - 1, locale);
  const window = previousWindow(start, end, prev.start, prev.end, todayEnd);
  const rangeEnd = window.partial ? todayEnd : end;
  const windows = monthWindows(year, locale);

  const [rates, txns, prevFlow, categories, prevCategories, top, history, sales, holdings] = await Promise.all([
    loadRates(),
    prisma.transaction.findMany({
      where: { householdId, type: { in: ["INCOME", "EXPENSE"] }, date: { gte: start, lte: rangeEnd } },
      select: { type: true, amount: true, currency: true, date: true },
    }),
    getFlowInRange(householdId, base, window.start, window.end),
    getCategoryBreakdown(householdId, base, start, rangeEnd),
    getCategoryBreakdown(householdId, base, window.start, window.end),
    getTopExpenses(householdId, base, start, rangeEnd, 10),
    getNetWorthHistory(householdId, base),
    getRealized(householdId, base),
    getInvestments(householdId),
  ]);

  const months = monthlyFlow(
    txns.map((t) => ({ day: t.date, type: t.type, amount: convert(toNumber(t.amount), t.currency, base, rates) })),
    windows,
  );
  const flow = months.reduce((s, m) => ({ income: s.income + m.income, expense: s.expense + m.expense, net: s.net + m.net }), {
    income: 0,
    expense: 0,
    net: 0,
  });
  // Holdings kept for others are theirs.
  const own = holdings
    .filter((h) => !h.heldForId)
    .map((h) => ({
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      value: convert(h.value, h.currency, base, rates),
      cost: convert(h.costBasis, h.currency, base, rates),
    }))
    .sort((a, b) => b.value - a.value);

  return {
    year,
    start,
    end,
    partial: window.partial,
    today,
    windows,
    months,
    flow,
    prevFlow,
    categories,
    prevCategories,
    top,
    worth: yearWorth(history.points, start, rangeEnd),
    realized: realizedIn(sales, start, rangeEnd),
    holdings: own,
  };
}

/**
 * How total worth moved over the year: from the day before it began, or —
 * for a household that started keeping books during the year — from its
 * first recorded day (`since`).
 */
function yearWorth(points: { day: string; total: number }[], start: Date, end: Date) {
  const whole = worthChange(points, start, end);
  if (whole) return { ...whole, since: null as Date | null };
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const inside = points.filter((p) => p.day >= from && p.day <= to);
  if (inside.length < 2) return null;
  const first = inside[0];
  const last = inside[inside.length - 1];
  return { from: first.total, to: last.total, change: last.total - first.total, since: new Date(first.day + "T00:00:00Z") };
}
