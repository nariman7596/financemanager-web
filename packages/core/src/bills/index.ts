/**
 * Monthly bills and instalments: when each is due, whether this month's has
 * been paid, and which regular payments in the history look like one.
 *
 * A bill is due on a day of the month in the owner's calendar (the 12th of
 * every Persian month, say). It counts as paid when a matching payment falls
 * in its cycle — the fifteen days before the due date through the fourteen
 * after — so a month's window never overlaps the next. A payment matches by
 * what it is: a transfer into the loan account, an expense with the bill's
 * own description (the SMS's "پرداخت قبض تلفن همراه"), or an expense in a
 * category at about the bill's amount.
 *
 * Pure: dates are days (midnight UTC), amounts in one currency.
 */

import { daysInJalaliMonth, fromJalaliParts, toJalaliParts, type CalendarSystem } from "../calendar";
import { canMakeRule, normalizeRuleMatch } from "../sms/rules";

const DAY = 24 * 60 * 60 * 1000;
export const CYCLE_BEFORE_DAYS = 15;
export const CYCLE_AFTER_DAYS = 14;

export type BillMatch =
  | { kind: "LOAN"; value: string } // loan account id
  | { kind: "DESCRIPTION"; value: string } // normalised description
  | { kind: "CATEGORY"; value: string }; // category id

export interface BillLike {
  amount: number;
  dueDay: number;
  leadDays: number;
  match: BillMatch;
}

export interface Payment {
  day: Date;
  type: "EXPENSE" | "TRANSFER";
  amount: number;
  description: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
}

export type BillState = "paid" | "overdue" | "today" | "soon" | "later";

export interface BillStatus {
  state: BillState;
  /** The due date of the cycle today belongs to. */
  due: Date;
  /** Days from today to it (negative once past). */
  days: number;
  /** The payment that settled this cycle, if any. */
  paidOn: Date | null;
  paidAmount: number | null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fromYmd = (s: string) => new Date(s + "T00:00:00Z");
export const dayOf = (d: Date) => new Date(Math.floor(d.getTime() / DAY) * DAY);

/** The due date in the month `offset` months from `ref`'s, clamped to that month's length. */
export function dueDateIn(ref: Date, dueDay: number, offset: number, calendar: CalendarSystem): Date {
  if (calendar === "JALALI") {
    const p = toJalaliParts(ymd(ref))!;
    let month = p.month + offset;
    let year = p.year;
    while (month > 12) (month -= 12), year++;
    while (month < 1) (month += 12), year--;
    const day = Math.min(dueDay, daysInJalaliMonth(year, month));
    return fromYmd(fromJalaliParts({ year, month, day }));
  }
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth() + offset;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dueDay, last)));
}

/** A payment's day of month in the calendar. */
export function dayOfMonth(d: Date, calendar: CalendarSystem): number {
  return calendar === "JALALI" ? toJalaliParts(ymd(d))!.day : d.getUTCDate();
}

/** Whether a payment is this bill's. A category match needs the amount within 30%. */
export function paysBill(bill: Pick<BillLike, "amount" | "match">, p: Payment): boolean {
  switch (bill.match.kind) {
    case "LOAN":
      return p.type === "TRANSFER" && p.transferAccountId === bill.match.value;
    case "DESCRIPTION":
      return !!p.description && normalizeRuleMatch(p.description) === bill.match.value;
    case "CATEGORY":
      return p.type === "EXPENSE" && p.categoryId === bill.match.value && (bill.amount <= 0 || Math.abs(p.amount - bill.amount) <= bill.amount * 0.3);
  }
}

/** Where a bill stands today: paid, overdue, due today, due soon (within its lead days) or later. */
export function billStatus(bill: BillLike, payments: Payment[], today: Date, calendar: CalendarSystem): BillStatus {
  const t = dayOf(today).getTime();
  // The cycle today falls in: the due date whose window [due-15, due+14] holds it.
  let due = dueDateIn(today, bill.dueDay, 0, calendar);
  if (t > due.getTime() + CYCLE_AFTER_DAYS * DAY) due = dueDateIn(today, bill.dueDay, 1, calendar);
  else if (t < due.getTime() - CYCLE_BEFORE_DAYS * DAY) due = dueDateIn(today, bill.dueDay, -1, calendar);
  const from = due.getTime() - CYCLE_BEFORE_DAYS * DAY;
  const paid = payments
    .filter((p) => {
      const d = dayOf(p.day).getTime();
      return d >= from && d <= t && paysBill(bill, p);
    })
    .sort((a, b) => b.day.getTime() - a.day.getTime())[0];
  const days = Math.round((due.getTime() - t) / DAY);
  let state: BillState;
  if (paid) state = "paid";
  else if (days < 0) state = "overdue";
  else if (days === 0) state = "today";
  else if (days <= bill.leadDays) state = "soon";
  else state = "later";
  return { state, due, days, paidOn: paid ? dayOf(paid.day) : null, paidAmount: paid ? paid.amount : null };
}

export interface BillSuggestion {
  match: BillMatch;
  /** The description, or the loan's id for the caller to name. */
  label: string;
  amount: number;
  dueDay: number;
  count: number;
  lastPaid: Date;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Regular monthly payments in the history that are not yet bills: the same
 * loan paid into, or the same specific description paid, at least twice
 * about a month apart (median gap 25–35 days), for a steady amount (each
 * within 25% of the median), the last within the past 45 days. Generic kinds
 * ("خرید", "پرداخت قبض") say nothing about what was paid and never qualify.
 */
export function suggestBills(
  payments: Payment[],
  loanAccountIds: Set<string>,
  known: BillMatch[],
  today: Date,
  calendar: CalendarSystem,
): BillSuggestion[] {
  const groups = new Map<string, { match: BillMatch; label: string; items: Payment[] }>();
  for (const p of payments) {
    let match: BillMatch | null = null;
    let label = "";
    if (p.type === "TRANSFER" && p.transferAccountId && loanAccountIds.has(p.transferAccountId)) {
      match = { kind: "LOAN", value: p.transferAccountId };
      label = p.transferAccountId;
    } else if (p.type === "EXPENSE" && canMakeRule(p.description)) {
      match = { kind: "DESCRIPTION", value: normalizeRuleMatch(p.description!) };
      label = p.description!.trim();
    }
    if (!match) continue;
    const key = `${match.kind}:${match.value}`;
    const g = groups.get(key) ?? { match, label, items: [] };
    g.items.push(p);
    groups.set(key, g);
  }
  const knownKeys = new Set(known.map((m) => `${m.kind}:${m.value}`));
  const t = dayOf(today).getTime();
  const out: BillSuggestion[] = [];
  for (const [key, g] of groups) {
    if (knownKeys.has(key)) continue;
    // One payment per day at most (a split payment is one bill).
    const byDay = new Map<number, Payment>();
    for (const p of g.items) {
      const d = dayOf(p.day).getTime();
      const prev = byDay.get(d);
      byDay.set(d, prev ? { ...prev, amount: prev.amount + p.amount } : p);
    }
    const items = [...byDay.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
    if (items.length < 2) continue;
    const last = items[items.length - 1];
    if (t - dayOf(last.day).getTime() > 45 * DAY) continue;
    const gaps = items.slice(1).map((p, i) => (dayOf(p.day).getTime() - dayOf(items[i].day).getTime()) / DAY);
    const gap = median(gaps);
    if (gap < 25 || gap > 35) continue;
    const amounts = items.map((p) => p.amount);
    const mid = median(amounts);
    if (!(mid > 0) || amounts.some((a) => Math.abs(a - mid) > mid * 0.25)) continue;
    const days = items.map((p) => dayOfMonth(p.day, calendar));
    out.push({ match: g.match, label: g.label, amount: last.amount, dueDay: Math.round(median(days)), count: items.length, lastPaid: dayOf(last.day) });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
