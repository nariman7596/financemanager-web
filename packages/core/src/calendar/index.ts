import * as gregorian from "date-fns";
import * as jalali from "date-fns-jalali";

import { type Locale } from "@financemanager/i18n/config";

/**
 * Month arithmetic in the reader's calendar.
 *
 * "This month" has to mean the month the user actually lives in. For a Persian
 * reader that is the Jalali month: August 2026 runs from 10 Mordad to 9
 * Shahrivar, so bucketing by Gregorian months and labelling the result مرداد
 * would report the wrong figure for the wrong period.
 *
 * `date-fns-jalali` mirrors the `date-fns` API on the Jalali calendar, so the
 * two are interchangeable behind this switch. Pinned to the release matching
 * the `date-fns` version in use so both behave identically.
 *
 * Only period boundaries and labels go through here. Instants are unchanged —
 * a Date is a Date; the calendar only decides where a month starts and ends.
 */
function fns(locale: Locale) {
  return locale === "fa" ? jalali : gregorian;
}

export function startOfMonthIn(date: Date, locale: Locale): Date {
  return fns(locale).startOfMonth(date);
}

export function endOfMonthIn(date: Date, locale: Locale): Date {
  return fns(locale).endOfMonth(date);
}

export function subMonthsIn(date: Date, amount: number, locale: Locale): Date {
  return fns(locale).subMonths(date, amount);
}

export function addMonthsIn(date: Date, amount: number, locale: Locale): Date {
  return fns(locale).addMonths(date, amount);
}

export function startOfYearIn(date: Date, locale: Locale): Date {
  return fns(locale).startOfYear(date);
}

// ---------------------------------------------------------------------------
// Calendar as stored data
//
// A recurring rule records the calendar its monthly/yearly step is measured in
// rather than deriving it from whoever happens to be reading. It schedules real
// money, so switching the UI language must not move it.
// ---------------------------------------------------------------------------

export type CalendarSystem = "GREGORIAN" | "JALALI";

export function calendarForLocale(locale: Locale): CalendarSystem {
  return locale === "fa" ? "JALALI" : "GREGORIAN";
}

function fnsForCalendar(calendar: string) {
  return calendar === "JALALI" ? jalali : gregorian;
}

/** Add months in the given calendar (clamping to the month's length). */
export function addMonthsInCalendar(date: Date, amount: number, calendar: string): Date {
  return fnsForCalendar(calendar).addMonths(date, amount);
}

/** Add years in the given calendar. */
export function addYearsInCalendar(date: Date, amount: number, calendar: string): Date {
  return fnsForCalendar(calendar).addYears(date, amount);
}

/**
 * Stable key identifying the month a date falls in, e.g. "1405-05".
 *
 * Internal only — it groups transactions and is never displayed. It must come
 * from the same calendar as the bucket boundaries, or rows land in the wrong
 * bucket.
 */
export function monthKeyIn(date: Date, locale: Locale): string {
  return fns(locale).format(date, "yyyy-MM");
}

/** Parse a key from `monthKeyIn` back into the first instant of that month. */
export function monthKeyToDate(key: string, locale: Locale): Date {
  return fns(locale).parse(`${key}-01`, "yyyy-MM-dd", new Date());
}

/**
 * Short label for a month bucket, e.g. "Aug" / "مرداد".
 *
 * `withYear` disambiguates a series that spans a year boundary.
 */
export function monthLabelIn(date: Date, locale: Locale, withYear = false): string {
  if (locale === "fa") {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      month: "long",
      ...(withYear ? { year: "2-digit" as const } : {}),
      timeZone: "UTC",
    }).format(date);
  }
  return gregorian.format(date, withYear ? "MMM ''yy" : "MMM");
}

/** Full month name for headings, e.g. "August" / "مرداد". */
export function monthNameIn(date: Date, locale: Locale): string {
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  return new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" }).format(date);
}

// ---------------------------------------------------------------------------
// Jalali date-field helpers
//
// `<input type="date">` is the browser's own control and always shows the
// Gregorian calendar, so a Persian user picking "today" sees 2026-08-12 rather
// than ۲۱ مرداد ۱۴۰۵. These back a Jalali field that still submits a Gregorian
// `yyyy-MM-dd`, so server actions and the database are untouched.
// ---------------------------------------------------------------------------

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
] as const;

export type JalaliParts = { year: number; month: number; day: number };

/** Split a Gregorian `yyyy-MM-dd` into Jalali parts (month is 1-based). */
export function toJalaliParts(gregorianYmd: string): JalaliParts | null {
  const d = gregorian.parse(gregorianYmd, "yyyy-MM-dd", new Date());
  if (!gregorian.isValid(d)) return null;
  return {
    year: Number(jalali.format(d, "yyyy")),
    month: Number(jalali.format(d, "MM")),
    day: Number(jalali.format(d, "dd")),
  };
}

/** Build a Gregorian `yyyy-MM-dd` from Jalali parts. Empty string if invalid. */
export function fromJalaliParts({ year, month, day }: JalaliParts): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = jalali.parse(`${year}-${pad(month)}-${pad(day)}`, "yyyy-MM-dd", new Date());
  return gregorian.isValid(d) ? gregorian.format(d, "yyyy-MM-dd") : "";
}

/** Length of a Jalali month: 31 days in months 1-6, 30 in 7-11, 29/30 in Esfand. */
export function daysInJalaliMonth(year: number, month: number): number {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = jalali.parse(`${year}-${pad(month)}-01`, "yyyy-MM-dd", new Date());
  return jalali.isValid(first) ? jalali.getDaysInMonth(first) : 31;
}

/** Today as a Gregorian `yyyy-MM-dd`. */
export function todayYmd(): string {
  return gregorian.format(new Date(), "yyyy-MM-dd");
}
