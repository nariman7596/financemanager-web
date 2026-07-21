import "server-only";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
} from "date-fns";
import { prisma } from "./prisma";
import { toNumber } from "./utils";
import { convert, loadRates } from "./currency";

// Read + aggregation helpers. Everything is scoped by userId so users only
// ever see their own data.

export async function getBaseCurrency(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { baseCurrency: true },
  });
  return u?.baseCurrency ?? "USD";
}

/** Current balance per account = openingBalance + inflows − outflows. */
export async function getAccountBalances(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "asc" },
  });

  const txns = await prisma.transaction.findMany({
    where: { userId },
    select: {
      accountId: true,
      transferAccountId: true,
      type: true,
      amount: true,
    },
  });

  const delta = new Map<string, number>();
  for (const t of txns) {
    const amt = toNumber(t.amount);
    if (t.type === "INCOME") {
      delta.set(t.accountId, (delta.get(t.accountId) ?? 0) + amt);
    } else if (t.type === "EXPENSE") {
      delta.set(t.accountId, (delta.get(t.accountId) ?? 0) - amt);
    } else if (t.type === "TRANSFER" && t.transferAccountId) {
      delta.set(t.accountId, (delta.get(t.accountId) ?? 0) - amt);
      delta.set(t.transferAccountId, (delta.get(t.transferAccountId) ?? 0) + amt);
    }
  }

  return accounts.map((a) => ({
    ...a,
    openingBalance: toNumber(a.openingBalance),
    balance: toNumber(a.openingBalance) + (delta.get(a.id) ?? 0),
  }));
}

/** Total net worth (accounts + investments) expressed in the base currency. */
export async function getNetWorth(userId: string, base: string) {
  const rates = await loadRates();
  const balances = await getAccountBalances(userId);
  const cash = balances.reduce(
    (s, a) => s + convert(a.balance, a.currency, base, rates),
    0,
  );

  const investments = await prisma.investment.findMany({ where: { userId } });
  const invValue = investments.reduce(
    (s, i) =>
      s +
      convert(toNumber(i.quantity) * toNumber(i.currentPrice), i.currency, base, rates),
    0,
  );

  return { cash, investments: invValue, total: cash + invValue };
}

/** Income / expense totals (base currency) for the given month. */
export async function getMonthlyFlow(userId: string, base: string, month = new Date()) {
  const rates = await loadRates();
  const txns = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startOfMonth(month), lte: endOfMonth(month) },
      type: { in: ["INCOME", "EXPENSE"] },
    },
    select: { type: true, amount: true, currency: true },
  });

  let income = 0;
  let expense = 0;
  for (const t of txns) {
    const v = convert(toNumber(t.amount), t.currency, base, rates);
    if (t.type === "INCOME") income += v;
    else expense += v;
  }
  return { income, expense, net: income - expense };
}

/** Income vs expense per month for the last N months (for the trend chart). */
export async function getCashFlowSeries(userId: string, base: string, months = 6) {
  const rates = await loadRates();
  const since = startOfMonth(subMonths(new Date(), months - 1));
  const txns = await prisma.transaction.findMany({
    where: { userId, date: { gte: since }, type: { in: ["INCOME", "EXPENSE"] } },
    select: { type: true, amount: true, currency: true, date: true },
  });

  const buckets = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i < months; i++) {
    const key = format(subMonths(new Date(), months - 1 - i), "yyyy-MM");
    buckets.set(key, { income: 0, expense: 0 });
  }

  for (const t of txns) {
    const key = format(t.date, "yyyy-MM");
    const b = buckets.get(key);
    if (!b) continue;
    const v = convert(toNumber(t.amount), t.currency, base, rates);
    if (t.type === "INCOME") b.income += v;
    else b.expense += v;
  }

  return Array.from(buckets.entries()).map(([key, v]) => ({
    month: format(new Date(`${key}-01`), "MMM"),
    income: Math.round(v.income),
    expense: Math.round(v.expense),
    net: Math.round(v.income - v.expense),
  }));
}

/** Expense breakdown by category (base currency) for the given month. */
export async function getSpendingByCategory(
  userId: string,
  base: string,
  month = new Date(),
) {
  const rates = await loadRates();
  const txns = await prisma.transaction.findMany({
    where: {
      userId,
      type: "EXPENSE",
      date: { gte: startOfMonth(month), lte: endOfMonth(month) },
    },
    select: { amount: true, currency: true, category: { select: { name: true, color: true } } },
  });

  const map = new Map<string, { name: string; color: string; value: number }>();
  for (const t of txns) {
    const name = t.category?.name ?? "Uncategorized";
    const color = t.category?.color ?? "#64748b";
    const v = convert(toNumber(t.amount), t.currency, base, rates);
    const cur = map.get(name);
    if (cur) cur.value += v;
    else map.set(name, { name, color, value: v });
  }

  return Array.from(map.values())
    .map((x) => ({ ...x, value: Math.round(x.value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

/** Budgets with actual spend this month (base of each budget's currency). */
export async function getBudgetProgress(userId: string, month = new Date()) {
  const rates = await loadRates();
  const budgets = await prisma.budget.findMany({
    where: { userId },
    include: { category: true },
  });

  const spendTxns = await prisma.transaction.findMany({
    where: {
      userId,
      type: "EXPENSE",
      date: { gte: startOfMonth(month), lte: endOfMonth(month) },
    },
    select: { amount: true, currency: true, categoryId: true },
  });

  return budgets.map((b) => {
    const spent = spendTxns
      .filter((t) => t.categoryId === b.categoryId)
      .reduce((s, t) => s + convert(toNumber(t.amount), t.currency, b.currency, rates), 0);
    const limit = toNumber(b.amount);
    return {
      id: b.id,
      category: b.category.name,
      color: b.category.color,
      currency: b.currency,
      period: b.period,
      limit,
      spent: Math.round(spent * 100) / 100,
      pct: limit > 0 ? Math.min(999, Math.round((spent / limit) * 100)) : 0,
    };
  });
}

export async function getInvestments(userId: string) {
  const items = await prisma.investment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return items.map((i) => {
    const qty = toNumber(i.quantity);
    const cost = toNumber(i.costBasis);
    const value = qty * toNumber(i.currentPrice);
    const gain = value - cost;
    return {
      ...i,
      quantity: qty,
      costBasis: cost,
      currentPrice: toNumber(i.currentPrice),
      value,
      gain,
      gainPct: cost > 0 ? (gain / cost) * 100 : 0,
    };
  });
}
