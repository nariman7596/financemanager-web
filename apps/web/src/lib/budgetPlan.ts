import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { addMonthsIn, startOfMonthIn, subMonthsIn } from "@financemanager/core/calendar";
import type { Locale } from "@financemanager/i18n/config";

/** What the planner keeps between visits (Household.budgetPlan). */
export type SavedPlan = {
  savingsRate: number;
  rent: number;
  otherFixed: number | null;
  protectedIds: string[];
};

export function readSavedPlan(json: unknown): SavedPlan | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    savingsRate: Math.min(1, Math.max(0, num(j.savingsRate) ?? 0.2)),
    rent: Math.max(0, num(j.rent) ?? 0),
    otherFixed: num(j.otherFixed),
    protectedIds: Array.isArray(j.protectedIds) ? j.protectedIds.filter((x): x is string => typeof x === "string") : [],
  };
}

const HISTORY_MONTHS = 3;

/**
 * Everything the planner page needs, in the household's base currency:
 * expense categories with their average monthly spending over the last full
 * months (up to three, and never before the household's first transaction,
 * so a new user's empty months do not drag the average down); last month's
 * actual income as the suggested income; and the latest instalment of every
 * loan as a fixed cost.
 */
export async function getPlannerInputs(householdId: string, base: string, locale: Locale, now = new Date()) {
  const rates = await loadRates();
  const thisMonth = startOfMonthIn(now, locale);
  const lastMonth = startOfMonthIn(subMonthsIn(now, 1, locale), locale);

  const [household, categories, first] = await Promise.all([
    prisma.household.findUnique({ where: { id: householdId }, select: { budgetPlan: true } }),
    prisma.category.findMany({
      where: { householdId, type: "EXPENSE", isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.transaction.findFirst({ where: { householdId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);

  // Full months with data: from the later of (3 months ago, the first
  // transaction's month) up to the start of this month.
  let historyStart = startOfMonthIn(subMonthsIn(now, HISTORY_MONTHS, locale), locale);
  if (first) {
    const firstMonth = startOfMonthIn(first.date, locale);
    // A household that started mid-month has no full month yet for that one.
    const firstFull = first.date.getTime() > firstMonth.getTime() ? startOfMonthIn(addMonthsIn(firstMonth, 1, locale), locale) : firstMonth;
    if (firstFull > historyStart) historyStart = firstFull;
  }
  let months = 0;
  for (let m = historyStart; m < thisMonth; m = startOfMonthIn(addMonthsIn(m, 1, locale), locale)) months++;

  const spent = new Map<string, number>();
  if (months > 0) {
    const rows = await prisma.transaction.findMany({
      where: { householdId, type: "EXPENSE", date: { gte: historyStart, lt: thisMonth }, categoryId: { not: null } },
      select: { categoryId: true, amount: true, currency: true },
    });
    for (const r of rows) {
      spent.set(r.categoryId!, (spent.get(r.categoryId!) ?? 0) + convert(toNumber(r.amount), r.currency, base, rates));
    }
  }

  // Suggested income: last month's; for a household in its first month, this
  // month's so far.
  const sumIncome = async (from: Date, to: Date) => {
    const rows = await prisma.transaction.findMany({
      where: { householdId, type: "INCOME", date: { gte: from, lt: to } },
      select: { amount: true, currency: true },
    });
    return rows.reduce((s, r) => s + convert(toNumber(r.amount), r.currency, base, rates), 0);
  };
  let income = await sumIncome(lastMonth, thisMonth);
  let incomeSource: "lastMonth" | "thisMonth" | "none" = "lastMonth";
  if (income === 0) {
    income = await sumIncome(thisMonth, new Date(now.getTime() + 1));
    incomeSource = income > 0 ? "thisMonth" : "none";
  }

  // The latest instalment of each loan: a fixed monthly outflow.
  const loans = await prisma.account.findMany({
    where: { householdId, type: "LOAN", isArchived: false },
    select: { id: true, currency: true },
  });
  let loanInstalments = 0;
  for (const l of loans) {
    const last = await prisma.transaction.findFirst({
      where: { householdId, type: "TRANSFER", transferAccountId: l.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { amount: true, currency: true },
    });
    if (last) loanInstalments += convert(toNumber(last.amount), last.currency, base, rates);
  }

  return {
    saved: readSavedPlan(household?.budgetPlan),
    categories: categories.map((c) => ({
      ...c,
      history: months > 0 ? Math.round((spent.get(c.id) ?? 0) / months) : 0,
    })),
    historyMonths: months,
    income: Math.round(income),
    incomeSource,
    loanInstalments: Math.round(loanInstalments),
  };
}
