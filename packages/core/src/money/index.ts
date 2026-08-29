// Money and date *formatting*. Presentation only — no arithmetic decisions
// live here, and nothing in this module touches storage.
//
// Extracted verbatim from apps/web/src/lib/utils.ts; the Tailwind `cn()` helper
// stayed behind in the web app because it is a styling concern, not a domain one.
import { currencySymbol } from "../constants";
import type { Locale } from "@financemanager/i18n/config";

/**
 * Currencies Intl cannot render usefully.
 *
 * Intl accepts any well-formed 3-letter code, so "IRT" does not throw — it
 * just prints the literal "IRT 1,234.00" instead of a symbol, and adds
 * decimals that toman has no sub-unit for. Format those ourselves, with the
 * unit after the amount as Persian writes it.
 */
const CUSTOM_CURRENCY_FORMAT: Record<string, { symbol: string; decimals: number }> = {
  IRT: { symbol: "تومان", decimals: 0 },
};

/** Format a number as currency for display. */
export function formatMoney(
  value: number | string,
  currency = "USD",
  opts: { compact?: boolean } = {},
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return `${currencySymbol(currency)}0`;

  const custom = CUSTOM_CURRENCY_FORMAT[currency];
  if (custom) {
    const amount = new Intl.NumberFormat("en-US", {
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : custom.decimals,
    }).format(num);
    return `${amount} ${custom.symbol}`;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
    }).format(num);
  } catch {
    // Fallback for currencies Intl doesn't know
    return `${currencySymbol(currency)}${num.toFixed(2)}`;
  }
}

/** Convert Prisma Decimal | number | string to a plain JS number. */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Format a calendar date for display, in the reader's calendar.
 *
 * Persian users read Jalali dates, so `fa` renders through the Persian
 * calendar — Intl supports it natively, no library needed:
 *
 *   2026-08-12  ->  en: Aug 12, 2026
 *                   fa: ۲۱ مرداد ۱۴۰۵
 *
 * Only the *display* changes. Everything stored, queried, exported or used
 * for scheduling stays Gregorian, which is what the database, the CSV export
 * and `<input type="date">` all speak.
 *
 * Formatted in UTC on purpose. Dates here come from `<input type="date">` and
 * land at midnight UTC; rendering them in a +03:30 zone would push anything
 * stored late in the day onto the following date. UTC shows back exactly the
 * day that was entered.
 */
export function formatDate(
  date: Date | string,
  locale: Locale,
  fmt: "short" | "long" = "short",
) {
  const d = typeof date === "string" ? new Date(date) : date;
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  return new Intl.DateTimeFormat(tag, {
    year: "numeric",
    month: fmt === "long" ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * The name of the month a date falls in, in the reader's calendar.
 *
 * ⚠️ Only use this to label a period that really is a month in that calendar.
 * A Gregorian month is not a Jalali month — August 2026 runs from 10 Mordad to
 * 9 Shahrivar — so labelling a Gregorian aggregate "مرداد" would misreport it.
 */
export function formatMonthName(date: Date, locale: Locale) {
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  return new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" }).format(date);
}
