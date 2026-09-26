import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { localToday } from "./bills";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { startOfMonthIn, endOfMonthIn, subMonthsIn } from "@financemanager/core/calendar";
import { categoryTrends, repeatingExpenses, unusualExpenses, type Expense } from "@financemanager/core/insights";
import type { Locale } from "@financemanager/i18n/config";

const DAY = 24 * 60 * 60 * 1000;

/**
 * The spending insights for a household, in its base currency: repeating
 * expenses, categories rising over the last six full months, and unusual
 * purchases in the last 45 days (judged against the year before each).
 */
export async function getInsights(householdId: string, base: string, locale: Locale) {
  const today = localToday(locale);
  const windows = [6, 5, 4, 3, 2, 1].map((i) => {
    const start = startOfMonthIn(subMonthsIn(today, i, locale), locale);
    return { start, end: endOfMonthIn(start, locale) };
  });
  const since = new Date(today.getTime() - 400 * DAY);
  const [rates, rows, categories, bills] = await Promise.all([
    loadRates(),
    prisma.transaction.findMany({
      where: { householdId, type: "EXPENSE", date: { gte: since } },
      select: { id: true, date: true, amount: true, currency: true, description: true, categoryId: true },
    }),
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, color: true } }),
    prisma.bill.findMany({ where: { householdId, matchKind: "DESCRIPTION" }, select: { matchValue: true } }),
  ]);
  const expenses: Expense[] = rows.map((r) => ({
    id: r.id,
    day: r.date,
    amount: convert(toNumber(r.amount), r.currency, base, rates),
    description: r.description,
    categoryId: r.categoryId,
  }));

  // A change worth a line: 2% of an average month's spending.
  const sixMonths = expenses.filter((e) => e.day >= windows[0].start && e.day <= windows[5].end);
  const monthly = sixMonths.reduce((s, e) => s + e.amount, 0) / 6;
  const trends = categoryTrends(expenses, windows, monthly * 0.02);
  const repeats = repeatingExpenses(
    expenses.filter((e) => e.day.getTime() >= today.getTime() - 240 * DAY),
    today,
  );
  const unusual = unusualExpenses(expenses, new Date(today.getTime() - 45 * DAY));

  return {
    windows,
    repeats,
    rising: trends.rising.slice(0, 8),
    unusual,
    categories: new Map(categories.map((c) => [c.id, c])),
    billMatches: new Set(bills.map((b) => b.matchValue)),
  };
}
