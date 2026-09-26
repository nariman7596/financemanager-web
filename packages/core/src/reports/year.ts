// The year in review: a calendar year in the reader's calendar (the Persian
// year starts at Nowruz), split into its twelve months. Pure + testable.
//
// Boundaries are UTC midnights, like the transaction dates they bucket.

import type { Locale } from "@financemanager/i18n/config";
import { fromJalaliParts, toJalaliParts } from "../calendar";
import { serializeCsv } from "../csv";

const utc = (ymd: string) => new Date(ymd + "T00:00:00Z");

/** The year a day falls in: ۱۴۰۵ for a Persian reader, 2026 otherwise. */
export function yearOf(day: Date, locale: Locale): number {
  if (locale !== "fa") return day.getUTCFullYear();
  return toJalaliParts(day.toISOString().slice(0, 10))!.year;
}

/** The first day of each month of `year`, and the first day of the next year. */
function monthStarts(year: number, locale: Locale): Date[] {
  return Array.from({ length: 13 }, (_, i) => {
    const y = year + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return locale === "fa" ? utc(fromJalaliParts({ year: y, month: m, day: 1 })) : new Date(Date.UTC(y, m - 1, 1));
  });
}

/** The twelve months of a year, each from its first day to its last instant. */
export function monthWindows(year: number, locale: Locale): { start: Date; end: Date }[] {
  const s = monthStarts(year, locale);
  return s.slice(0, 12).map((start, i) => ({ start, end: new Date(s[i + 1].getTime() - 1) }));
}

export function yearBounds(year: number, locale: Locale): { start: Date; end: Date } {
  const s = monthStarts(year, locale);
  return { start: s[0], end: new Date(s[12].getTime() - 1) };
}

export interface MonthFlow {
  income: number;
  expense: number;
  net: number;
}

/** Income and expense per month; transfers are neither. */
export function monthlyFlow(
  rows: { day: Date; type: string; amount: number }[],
  windows: { start: Date; end: Date }[],
): MonthFlow[] {
  const out = windows.map(() => ({ income: 0, expense: 0, net: 0 }));
  for (const r of rows) {
    if (r.type !== "INCOME" && r.type !== "EXPENSE") continue;
    const i = windows.findIndex((w) => r.day >= w.start && r.day <= w.end);
    if (i < 0) continue;
    if (r.type === "INCOME") out[i].income += r.amount;
    else out[i].expense += r.amount;
  }
  return out.map((m) => ({ ...m, net: m.income - m.expense }));
}

/** The share of income kept; null when there was no income. */
export function savingsRate(income: number, expense: number): number | null {
  return income > 0 ? (income - expense) / income : null;
}

export interface YearCsvData {
  year: number;
  base: string;
  labels: {
    summary: string; income: string; expenses: string; net: string; savingsRate: string;
    worthStart: string; worthEnd: string; realized: string;
    months: string; month: string; categories: string; category: string; amount: string; share: string;
    holdings: string; holding: string; value: string; cost: string; gain: string;
  };
  flow: MonthFlow;
  worth: { from: number; to: number } | null;
  realized: number;
  months: { label: string; flow: MonthFlow }[];
  categories: { name: string; value: number }[];
  holdings: { name: string; value: number; cost: number }[];
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const pct = (n: number | null) => (n === null ? "" : (n * 100).toFixed(1) + "%");

/** The year as a multi-section CSV: summary, months, categories, holdings. */
export function buildYearCsv(d: YearCsvData): string {
  const L = d.labels;
  const totalExpense = d.categories.reduce((s, c) => s + c.value, 0);
  const rows: (string | number | null)[][] = [
    [L.summary, String(d.year), d.base],
    [L.income, money(d.flow.income)],
    [L.expenses, money(d.flow.expense)],
    [L.net, money(d.flow.net)],
    [L.savingsRate, pct(savingsRate(d.flow.income, d.flow.expense))],
    ...(d.worth ? [[L.worthStart, money(d.worth.from)], [L.worthEnd, money(d.worth.to)]] : []),
    [L.realized, money(d.realized)],
    [],
    [L.months],
    [L.month, L.income, L.expenses, L.net],
    ...d.months.map((m) => [m.label, money(m.flow.income), money(m.flow.expense), money(m.flow.net)]),
    [],
    [L.categories],
    [L.category, L.amount, L.share],
    ...d.categories.map((c) => [c.name, money(c.value), pct(totalExpense > 0 ? c.value / totalExpense : null)]),
    [],
    [L.holdings],
    [L.holding, L.value, L.cost, L.gain],
    ...d.holdings.map((h) => [h.name, money(h.value), money(h.cost), money(h.value - h.cost)]),
  ];
  return serializeCsv(rows);
}
