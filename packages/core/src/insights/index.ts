/**
 * Where spending leaks, from the expenses themselves. Pure + testable; the
 * app passes expenses already converted to one currency.
 *
 * - repeating expenses: the same specific description at a steady weekly or
 *   monthly rhythm and amount — subscriptions and habits, with what they
 *   cost a year, and whether they stopped;
 * - rising categories: the last three full months against the three before;
 * - unusual expenses: a single purchase far above what its category costs.
 */

import { canMakeRule, normalizeRuleMatch } from "../sms/rules";

const DAY = 24 * 60 * 60 * 1000;

export interface Expense {
  id: string;
  day: Date;
  amount: number;
  description: string | null;
  categoryId: string | null;
}

const dayOf = (d: Date) => Math.floor(d.getTime() / DAY) * DAY;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

// --- Repeating expenses ------------------------------------------------------

export type RepeatPeriod = "WEEKLY" | "MONTHLY";

export interface Repeat {
  /** The description as last written. */
  label: string;
  /** Normalised, as bills and rules store it. */
  match: string;
  period: RepeatPeriod;
  /** The usual amount each time. */
  amount: number;
  perMonth: number;
  perYear: number;
  count: number;
  last: Date;
  /** Still going: the last one is not overdue by more than half a period. */
  active: boolean;
  /** The category most of them were filed under. */
  categoryId: string | null;
}

/**
 * Expenses that repeat: the same specific description (generic bank kinds
 * like "خرید" never — they are on half the messages), at least three
 * different days, a median gap of about a week (5–9 days) or a month (25–35),
 * and each amount within 30% of the usual one. Sorted by yearly cost.
 */
export function repeatingExpenses(expenses: Expense[], today: Date): Repeat[] {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (!canMakeRule(e.description)) continue;
    const key = normalizeRuleMatch(e.description!);
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  const out: Repeat[] = [];
  for (const [match, list] of groups) {
    // One per day (a split payment is one).
    const byDay = new Map<number, { day: number; amount: number; e: Expense }>();
    for (const e of list) {
      const d = dayOf(e.day);
      const prev = byDay.get(d);
      byDay.set(d, { day: d, amount: (prev?.amount ?? 0) + e.amount, e: prev?.e ?? e });
    }
    const items = [...byDay.values()].sort((a, b) => a.day - b.day);
    if (items.length < 3) continue;
    const gap = median(items.slice(1).map((x, i) => (x.day - items[i].day) / DAY));
    const period: RepeatPeriod | null = gap >= 5 && gap <= 9 ? "WEEKLY" : gap >= 25 && gap <= 35 ? "MONTHLY" : null;
    if (!period) continue;
    const amount = median(items.map((x) => x.amount));
    if (!(amount > 0) || items.some((x) => Math.abs(x.amount - amount) > amount * 0.3)) continue;
    const last = items[items.length - 1];
    const perMonth = period === "WEEKLY" ? (amount * 52) / 12 : amount;
    const cats = new Map<string, number>();
    for (const e of list) if (e.categoryId) cats.set(e.categoryId, (cats.get(e.categoryId) ?? 0) + 1);
    const categoryId = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    out.push({
      label: last.e.description!.trim(),
      match,
      period,
      amount,
      perMonth,
      perYear: perMonth * 12,
      count: items.length,
      last: new Date(last.day),
      active: dayOf(today) - last.day <= gap * 1.5 * DAY,
      categoryId,
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.perYear - a.perYear);
}

// --- Rising categories -------------------------------------------------------

export interface CategoryTrend {
  categoryId: string;
  /** Total per month, oldest first. */
  months: number[];
  /** Monthly average of the last three months. */
  recent: number;
  /** Monthly average of the three before. */
  before: number;
  change: number;
  /** Relative change; null when there was nothing before. */
  pct: number | null;
}

/**
 * Each category's total over six consecutive full months (the windows, in
 * the reader's calendar, oldest first), and the last three against the
 * three before. `rising` keeps those up by at least 20% and `minChange` a
 * month — a category going from 10 to 20 toman is not news.
 */
export function categoryTrends(
  expenses: Expense[],
  windows: { start: Date; end: Date }[],
  minChange = 0,
): { all: CategoryTrend[]; rising: CategoryTrend[] } {
  const n = windows.length;
  const half = Math.floor(n / 2);
  const byCat = new Map<string, number[]>();
  for (const e of expenses) {
    if (!e.categoryId) continue;
    const i = windows.findIndex((w) => e.day >= w.start && e.day <= w.end);
    if (i < 0) continue;
    const months = byCat.get(e.categoryId) ?? new Array(n).fill(0);
    months[i] += e.amount;
    byCat.set(e.categoryId, months);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const all = [...byCat.entries()].map(([categoryId, months]) => {
    const recent = avg(months.slice(n - half));
    const before = avg(months.slice(0, n - half));
    return { categoryId, months, recent, before, change: recent - before, pct: before > 0 ? (recent - before) / before : null };
  });
  const rising = all
    .filter((c) => c.change >= minChange && c.change > 0 && (c.pct === null ? c.recent > 0 : c.pct >= 0.2))
    .sort((a, b) => b.change - a.change);
  return { all: all.sort((a, b) => b.recent - a.recent), rising };
}

// --- Unusual expenses --------------------------------------------------------

export interface Unusual {
  expense: Expense;
  /** What this category usually costs per purchase. */
  usual: number;
  /** How many times the usual. */
  times: number;
}

/**
 * Recent expenses (on or after `since`) at least three times their
 * category's usual purchase and above nine in ten of the purchases before —
 * judged against that category's year before each one, and only where there
 * are at least five to judge by. Largest multiple first.
 */
export function unusualExpenses(expenses: Expense[], since: Date, limit = 8): Unusual[] {
  const byCat = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (!e.categoryId) continue;
    const list = byCat.get(e.categoryId) ?? [];
    list.push(e);
    byCat.set(e.categoryId, list);
  }
  const out: Unusual[] = [];
  for (const list of byCat.values()) {
    for (const e of list) {
      if (e.day < since) continue;
      const from = e.day.getTime() - 365 * DAY;
      const before = list.filter((x) => x !== e && x.day.getTime() >= from && x.day.getTime() <= e.day.getTime()).map((x) => x.amount);
      if (before.length < 5) continue;
      const usual = median(before);
      if (!(usual > 0)) continue;
      if (e.amount >= usual * 3 && e.amount > quantile(before, 0.9)) out.push({ expense: e, usual, times: e.amount / usual });
    }
  }
  return out.sort((a, b) => b.times - a.times).slice(0, limit);
}
