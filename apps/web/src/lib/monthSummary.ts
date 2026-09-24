import { monthKeyIn, startOfMonthIn, subMonthsIn } from "@financemanager/core/calendar";
import type { Locale } from "@financemanager/i18n/config";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Which month the summary opens on: the one just finished during the first
 * week of a new month (that is when it gets read), otherwise the month in
 * progress. Also used by the dashboard to decide when to point here.
 */
export function defaultSummaryMonth(now: Date, locale: Locale): { key: string; justEnded: boolean } {
  const justEnded = now.getTime() < startOfMonthIn(now, locale).getTime() + WEEK;
  return {
    key: monthKeyIn(justEnded ? subMonthsIn(now, 1, locale) : now, locale),
    justEnded,
  };
}

