import "server-only";
import { startOfMonth, endOfMonth, subMonths, addMonths, format } from "date-fns";
import {
  startOfMonthIn,
  endOfMonthIn,
  subMonthsIn,
  addMonthsIn,
  monthKeyIn,
  monthKeyToDate,
  monthLabelIn,
} from "@financemanager/core/calendar";
import { DEFAULT_LOCALE, type Locale } from "@financemanager/i18n/config";
import { prisma } from "@financemanager/db";
import { toNumber } from "@financemanager/core/money";
import { loadRates } from "./currency";
import { convert } from "@financemanager/core/currency";

// Read + aggregation helpers. Everything is scoped by householdId; callers get
// that id from the household access layer, which has already verified the user
// is a member (src/lib/household.ts).

export async function getBaseCurrency(householdId: string): Promise<string> {
  const h = await prisma.household.findUnique({
    where: { id: householdId },
    select: { baseCurrency: true },
  });
  return h?.baseCurrency ?? "USD";
}

/** Current balance per account = openingBalance + inflows − outflows. */
export async function getAccountBalances(householdId: string) {
  const accounts = await prisma.account.findMany({
    where: { householdId, isArchived: false },
    orderBy: { createdAt: "asc" },
  });

  const txns = await prisma.transaction.findMany({
    where: { householdId },
    select: { accountId: true, transferAccountId: true, type: true, amount: true },
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
export async function getNetWorth(householdId: string, base: string) {
  const rates = await loadRates();
  const balances = await getAccountBalances(householdId);
  const cash = balances.reduce(
    (s, a) => s + convert(a.balance, a.currency, base, rates),
    0,
  );

  const investments = await prisma.investment.findMany({ where: { householdId } });
  const invValue = investments.reduce(
    (s, i) =>
      s +
      convert(toNumber(i.quantity) * toNumber(i.currentPrice), i.currency, base, rates),
    0,
  );

  return { cash, investments: invValue, total: cash + invValue };
}

/** Income / expense totals (base currency) between two dates (inclusive). */
export async function getFlowInRange(householdId: string, base: string, start: Date, end: Date) {
  const rates = await loadRates();
  const txns = await prisma.transaction.findMany({
    where: {
      householdId,
      date: { gte: start, lte: end },
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

/** Income / expense totals for the given month (dashboard helper). */
export async function getMonthlyFlow(
  householdId: string,
  base: string,
  month = new Date(),
  locale: Locale = DEFAULT_LOCALE,
) {
  return getFlowInRange(
    householdId,
    base,
    startOfMonthIn(month, locale),
    endOfMonthIn(month, locale),
  );
}

/** Income vs expense per month for the last N months (for the trend chart). */
export async function getCashFlowSeries(
  householdId: string,
  base: string,
  months = 6,
  locale: Locale = DEFAULT_LOCALE,
) {
  const rates = await loadRates();
  const since = startOfMonthIn(subMonthsIn(new Date(), months - 1, locale), locale);
  const txns = await prisma.transaction.findMany({
    where: { householdId, date: { gte: since }, type: { in: ["INCOME", "EXPENSE"] } },
    select: { type: true, amount: true, currency: true, date: true },
  });

  const buckets = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i < months; i++) {
    const key = monthKeyIn(subMonthsIn(new Date(), months - 1 - i, locale), locale);
    buckets.set(key, { income: 0, expense: 0 });
  }

  for (const t of txns) {
    const key = monthKeyIn(t.date, locale);
    const b = buckets.get(key);
    if (!b) continue;
    const v = convert(toNumber(t.amount), t.currency, base, rates);
    if (t.type === "INCOME") b.income += v;
    else b.expense += v;
  }

  return Array.from(buckets.entries()).map(([key, v]) => ({
    month: monthLabelIn(monthKeyToDate(key, locale), locale),
    income: Math.round(v.income),
    expense: Math.round(v.expense),
    net: Math.round(v.income - v.expense),
  }));
}

/** Expense breakdown by category (base currency) between two dates (inclusive). */
export async function getCategoryBreakdown(householdId: string, base: string, start: Date, end: Date) {
  const rates = await loadRates();
  const txns = await prisma.transaction.findMany({
    where: {
      householdId,
      type: "EXPENSE",
      date: { gte: start, lte: end },
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

/** Expense breakdown by category for the given month (dashboard helper). */
export async function getSpendingByCategory(
  householdId: string,
  base: string,
  month = new Date(),
  locale: Locale = DEFAULT_LOCALE,
) {
  return getCategoryBreakdown(
    householdId,
    base,
    startOfMonthIn(month, locale),
    endOfMonthIn(month, locale),
  );
}

/** Income vs expense per month across an arbitrary date range (for the trend chart). */
export async function getSeriesInRange(
  householdId: string,
  base: string,
  start: Date,
  end: Date,
  locale: Locale = DEFAULT_LOCALE,
) {
  const rates = await loadRates();
  const from = startOfMonthIn(start, locale);
  const txns = await prisma.transaction.findMany({
    where: { householdId, date: { gte: from, lte: end }, type: { in: ["INCOME", "EXPENSE"] } },
    select: { type: true, amount: true, currency: true, date: true },
  });

  // Build an ordered set of month buckets between start and end.
  const buckets = new Map<string, { income: number; expense: number }>();
  let cursor = from;
  const endMonth = startOfMonthIn(end, locale);
  while (cursor <= endMonth) {
    buckets.set(monthKeyIn(cursor, locale), { income: 0, expense: 0 });
    cursor = addMonthsIn(cursor, 1, locale);
  }

  for (const t of txns) {
    const b = buckets.get(monthKeyIn(t.date, locale));
    if (!b) continue;
    const v = convert(toNumber(t.amount), t.currency, base, rates);
    if (t.type === "INCOME") b.income += v;
    else b.expense += v;
  }

  const multiYear = start.getFullYear() !== end.getFullYear();
  return Array.from(buckets.entries()).map(([key, v]) => ({
    month: monthLabelIn(monthKeyToDate(key, locale), locale, multiYear),
    income: Math.round(v.income),
    expense: Math.round(v.expense),
    net: Math.round(v.income - v.expense),
  }));
}

/** Budgets with actual spend this month (in each budget's currency). */
export async function getBudgetProgress(
  householdId: string,
  month = new Date(),
  locale: Locale = DEFAULT_LOCALE,
) {
  const rates = await loadRates();
  const budgets = await prisma.budget.findMany({
    where: { householdId },
    include: { category: true },
  });

  const spendTxns = await prisma.transaction.findMany({
    where: {
      householdId,
      type: "EXPENSE",
      date: { gte: startOfMonthIn(month, locale), lte: endOfMonthIn(month, locale) },
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

/**
 * "Who spent what" for the month: expense + income per household member
 * (base currency). Includes every current member (even with zero activity) so
 * the caller can tell a shared household from a solo one, plus an "Unknown"
 * bucket for rows with no recorded creator (e.g. older imports).
 */
export async function getMemberBreakdown(householdId: string, base: string, start: Date, end: Date) {
  const rates = await loadRates();

  const [members, txns] = await Promise.all([
    prisma.membership.findMany({
      where: { householdId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        householdId,
        type: { in: ["INCOME", "EXPENSE"] },
        date: { gte: start, lte: end },
      },
      select: { type: true, amount: true, currency: true, createdById: true },
    }),
  ]);

  const nameFor = new Map<string, string>(
    members.map((m) => [m.userId, m.user.name ?? m.user.email]),
  );

  type Row = { id: string; name: string; spent: number; earned: number };
  const rows = new Map<string, Row>();
  // Seed a row per current member so everyone appears.
  for (const m of members) {
    rows.set(m.userId, { id: m.userId, name: nameFor.get(m.userId) ?? "Member", spent: 0, earned: 0 });
  }

  for (const t of txns) {
    const key = t.createdById ?? "unknown";
    if (!rows.has(key)) {
      rows.set(key, {
        id: key,
        name: key === "unknown" ? "Unknown" : nameFor.get(key) ?? "Former member",
        spent: 0,
        earned: 0,
      });
    }
    const row = rows.get(key)!;
    const v = convert(toNumber(t.amount), t.currency, base, rates);
    if (t.type === "EXPENSE") row.spent += v;
    else row.earned += v;
  }

  const result = Array.from(rows.values()).map((r) => ({
    ...r,
    spent: Math.round(r.spent * 100) / 100,
    earned: Math.round(r.earned * 100) / 100,
  }));
  result.sort((a, b) => b.spent - a.spent);
  return { members: members.length, rows: result };
}

/** Per-member spending for the given month (dashboard helper). */
export async function getSpendingByMember(
  householdId: string,
  base: string,
  month = new Date(),
  locale: Locale = DEFAULT_LOCALE,
) {
  return getMemberBreakdown(
    householdId,
    base,
    startOfMonthIn(month, locale),
    endOfMonthIn(month, locale),
  );
}

export async function getInvestments(householdId: string) {
  const items = await prisma.investment.findMany({
    where: { householdId },
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
