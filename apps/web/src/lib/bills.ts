import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { calendarForLocale } from "@financemanager/core/calendar";
import { billStatus, dayOf, suggestBills, type BillMatch, type BillStatus, type Payment } from "@financemanager/core/bills";
import type { Locale } from "@financemanager/i18n/config";

/** Today in the reader's zone: transactions are dated by the local (Tehran) day. */
export function localToday(locale: Locale, now = new Date()): Date {
  return dayOf(locale === "fa" ? new Date(now.getTime() + 3.5 * 60 * 60 * 1000) : now);
}

const matchOf = (b: { matchKind: string; matchValue: string }) => ({ kind: b.matchKind, value: b.matchValue }) as BillMatch;

/**
 * Every bill with where it stands this cycle, the reminders due (overdue,
 * today, within the lead days — worst first) and regular payments in the
 * last eight months that could become bills.
 */
export async function getBills(householdId: string, base: string, locale: Locale) {
  const calendar = calendarForLocale(locale);
  const today = localToday(locale);
  const since = new Date(today.getTime() - 250 * 24 * 60 * 60 * 1000);
  const [rates, bills, txns, loans, categories] = await Promise.all([
    loadRates(),
    prisma.bill.findMany({ where: { householdId }, orderBy: { dueDay: "asc" } }),
    prisma.transaction.findMany({
      where: { householdId, date: { gte: since }, type: { in: ["EXPENSE", "TRANSFER"] } },
      select: { date: true, type: true, amount: true, currency: true, description: true, categoryId: true, transferAccountId: true },
    }),
    prisma.account.findMany({ where: { householdId, type: "LOAN" }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true } }),
  ]);
  const payments: Payment[] = txns.map((t) => ({
    day: t.date,
    type: t.type as Payment["type"],
    amount: convert(toNumber(t.amount), t.currency, base, rates),
    description: t.description,
    categoryId: t.categoryId,
    transferAccountId: t.transferAccountId,
  }));

  const rows = bills.map((b) => {
    const amount = toNumber(b.amount);
    const status: BillStatus = billStatus(
      { amount: convert(amount, b.currency, base, rates), dueDay: b.dueDay, leadDays: b.leadDays, match: matchOf(b) },
      payments,
      today,
      calendar,
    );
    return { ...b, amount, status };
  });
  const rank = { overdue: 0, today: 1, soon: 2, later: 3, paid: 4 } as const;
  const alerts = rows
    .filter((b) => b.active && (b.status.state === "overdue" || b.status.state === "today" || b.status.state === "soon"))
    .sort((a, b) => rank[a.status.state] - rank[b.status.state] || a.status.days - b.status.days);

  const loanNames = new Map(loans.map((l) => [l.id, l.name]));
  const suggestions = suggestBills(payments, new Set(loans.map((l) => l.id)), bills.map(matchOf), today, calendar).map((s) => ({
    ...s,
    name: s.match.kind === "LOAN" ? loanNames.get(s.match.value) ?? s.label : s.label,
  }));

  return {
    bills: rows,
    alerts,
    suggestions,
    loans,
    categories,
    names: { loans: loanNames, categories: new Map(categories.map((c) => [c.id, c.name])) },
  };
}
