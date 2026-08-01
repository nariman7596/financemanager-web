import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
  format,
} from "date-fns";

// Date-range presets + URL-param resolution for the Reports page. Pure (no
// server-only) so it's testable and usable on client + server. Pass `now` for
// deterministic behavior.

export const RANGE_PRESETS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-3-months", label: "Last 3 months" },
  { key: "last-6-months", label: "Last 6 months" },
  { key: "this-year", label: "This year" },
  { key: "last-12-months", label: "Last 12 months" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["key"] | "custom";

export const DEFAULT_PRESET: RangePreset = "last-6-months";

export function computePreset(key: string, now: Date): { start: Date; end: Date } {
  const endThisMonth = endOfMonth(now);
  switch (key) {
    case "this-month":
      return { start: startOfMonth(now), end: endThisMonth };
    case "last-month": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case "last-3-months":
      return { start: startOfMonth(subMonths(now, 2)), end: endThisMonth };
    case "last-6-months":
      return { start: startOfMonth(subMonths(now, 5)), end: endThisMonth };
    case "this-year":
      return { start: startOfYear(now), end: endThisMonth };
    case "last-12-months":
      return { start: startOfMonth(subMonths(now, 11)), end: endThisMonth };
    default:
      return { start: startOfMonth(subMonths(now, 5)), end: endThisMonth };
  }
}

export interface ResolvedRange {
  start: Date;
  end: Date;
  preset: RangePreset;
  fromStr: string; // yyyy-MM-dd
  toStr: string;
  label: string;
}

/** Resolve {from,to,preset} search params into a concrete range. */
export function resolveRange(
  params: { from?: string; to?: string; preset?: string },
  now: Date = new Date(),
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
        label: `${format(start, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`,
      };
    }
  }

  const presetKey = known?.key ?? DEFAULT_PRESET;
  const { start, end } = computePreset(presetKey, now);
  return {
    start,
    end,
    preset: presetKey,
    fromStr: format(start, "yyyy-MM-dd"),
    toStr: format(end, "yyyy-MM-dd"),
    label: RANGE_PRESETS.find((p) => p.key === presetKey)?.label ?? "Custom",
  };
}
