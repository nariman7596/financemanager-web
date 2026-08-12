import * as gregorian from "date-fns";
import * as jalali from "date-fns-jalali";

import { type Locale } from "./i18n/config";

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
