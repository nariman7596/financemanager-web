import {
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
  format,
} from "date-fns";
import {
  startOfMonthIn,
  endOfMonthIn,
  subMonthsIn,
  startOfYearIn,
} from "./calendar";
import { DEFAULT_LOCALE, type Locale } from "./i18n/config";

// Date-range presets + URL-param resolution for the Reports page. Pure (no
// server-only) so it's testable and usable on client + server. Pass `now` for
// deterministic behavior.

// Presets carry a translation key rather than a display string: this module is
// shared by client and server and has no locale of its own, so the caller
// translates with its own `t`.
export const RANGE_PRESETS = [
  { key: "this-month", labelKey: "range.thisMonth" },
  { key: "last-month", labelKey: "range.lastMonth" },
  { key: "last-3-months", labelKey: "range.last3Months" },
  { key: "last-6-months", labelKey: "range.last6Months" },
  { key: "this-year", labelKey: "range.thisYear" },
  { key: "last-12-months", labelKey: "range.last12Months" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["key"] | "custom";

export const DEFAULT_PRESET: RangePreset = "last-6-months";

export function computePreset(
  key: string,
  now: Date,
  locale: Locale = DEFAULT_LOCALE,
): { start: Date; end: Date } {
  const endThisMonth = endOfMonthIn(now, locale);
  switch (key) {
    case "this-month":
      return { start: startOfMonthIn(now, locale), end: endThisMonth };
    case "last-month": {
      const prev = subMonthsIn(now, 1, locale);
      return { start: startOfMonthIn(prev, locale), end: endOfMonthIn(prev, locale) };
    }
    case "last-3-months":
      return { start: startOfMonthIn(subMonthsIn(now, 2, locale), locale), end: endThisMonth };
    case "last-6-months":
      return { start: startOfMonthIn(subMonthsIn(now, 5, locale), locale), end: endThisMonth };
    case "this-year":
      return { start: startOfYearIn(now, locale), end: endThisMonth };
    case "last-12-months":
      return { start: startOfMonthIn(subMonthsIn(now, 11, locale), locale), end: endThisMonth };
    default:
      return { start: startOfMonthIn(subMonthsIn(now, 5, locale), locale), end: endThisMonth };
  }
}

export interface ResolvedRange {
  start: Date;
  end: Date;
  preset: RangePreset;
  fromStr: string; // yyyy-MM-dd
  toStr: string;
  labelKey: string;
}

/** Resolve {from,to,preset} search params into a concrete range. */
export function resolveRange(
  params: { from?: string; to?: string; preset?: string },
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): ResolvedRange {
  const known = RANGE_PRESETS.find((p) => p.key === params.preset);

  // Custom range: explicit, valid from/to (and not a named preset).
  if (!known && params.from && params.to) {
    const from = parseISO(params.from);
    const to = parseISO(params.to);
    if (isValid(from) && isValid(to) && from <= to) {
      const start = startOfDay(from);
      const end = endOfDay(to);
      return {
        start,
        end,
        preset: "custom",
        fromStr: format(start, "yyyy-MM-dd"),
        toStr: format(to, "yyyy-MM-dd"),
        labelKey: "range.custom",
      };
    }
  }

  const presetKey = known?.key ?? DEFAULT_PRESET;
  const { start, end } = computePreset(presetKey, now, locale);
  return {
    start,
    end,
    preset: presetKey,
    fromStr: format(start, "yyyy-MM-dd"),
    toStr: format(end, "yyyy-MM-dd"),
    labelKey:
      RANGE_PRESETS.find((p) => p.key === presetKey)?.labelKey ?? "range.custom",
  };
}
