// Week arithmetic for the weekly summary. Pure + testable.
//
// Transactions are dated by the local day at midnight UTC, so weeks are
// counted on UTC days here rather than through date-fns, whose startOfWeek
// follows the server's time zone.

import type { Locale } from "@financemanager/i18n/config";

const DAY = 24 * 60 * 60 * 1000;

/** The Iranian week runs Saturday–Friday; the English one Monday–Sunday. */
const firstDay = (locale: Locale) => (locale === "fa" ? 6 : 1);

const dayOf = (d: Date) => new Date(Math.floor(d.getTime() / DAY) * DAY);

/** The first day (midnight UTC) of the week `day` falls in. */
export function weekStart(day: Date, locale: Locale): Date {
  const d = dayOf(day);
  const back = (d.getUTCDay() - firstDay(locale) + 7) % 7;
  return new Date(d.getTime() - back * DAY);
}

/** The week's last instant — the end of its seventh day. */
export function weekEnd(start: Date): Date {
  return new Date(start.getTime() + 7 * DAY - 1);
}

export function addWeeks(start: Date, n: number): Date {
  return new Date(start.getTime() + n * 7 * DAY);
}

/** A week's key in URLs: its first day, yyyy-mm-dd (Gregorian, like all stored dates). */
export function weekKey(start: Date): string {
  return start.toISOString().slice(0, 10);
}

/** A key from a URL back to its week, or null when it is not a date. */
export function weekFromKey(key: string | undefined, locale: Locale): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(key + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : weekStart(d, locale);
}

/**
 * Which week the summary opens on, and whether the dashboard should point at
 * it. On the week's last day (Friday for a Persian reader) the week in
 * progress is all but done; for the first two days of the next one, the week
 * just ended is the one worth reading. Otherwise the week in progress, with
 * no nudge.
 */
export function defaultSummaryWeek(today: Date, locale: Locale): { start: Date; nudge: boolean } {
  const start = weekStart(today, locale);
  const dayIndex = Math.round((dayOf(today).getTime() - start.getTime()) / DAY);
  if (dayIndex <= 1) return { start: addWeeks(start, -1), nudge: true };
  return { start, nudge: dayIndex === 6 };
}

/** Expenses per day of a week, seven entries from its first day. */
export function dailyTotals(start: Date, rows: { day: Date; value: number }[]): { day: Date; value: number }[] {
  const days = Array.from({ length: 7 }, (_, i) => ({ day: new Date(start.getTime() + i * DAY), value: 0 }));
  for (const r of rows) {
    const i = Math.floor((dayOf(r.day).getTime() - start.getTime()) / DAY);
    if (i >= 0 && i < 7) days[i].value += r.value;
  }
  return days.map((d) => ({ ...d, value: Math.round(d.value * 100) / 100 }));
}

/**
 * How much the total worth moved over a week, from a daily series (sorted
 * by day, yyyy-mm-dd). Measured from the last point before the week to the
 * last one inside it; null when the series does not reach back that far.
 */
export function worthChange(
  points: { day: string; total: number }[],
  start: Date,
  end: Date,
): { from: number; to: number; change: number } | null {
  const before = weekKey(new Date(start.getTime() - DAY));
  const last = weekKey(dayOf(end));
  let from: number | null = null;
  let to: number | null = null;
  for (const p of points) {
    if (p.day <= before) from = p.total;
    if (p.day <= last) to = p.total;
  }
  if (from === null || to === null) return null;
  return { from, to, change: to - from };
}
