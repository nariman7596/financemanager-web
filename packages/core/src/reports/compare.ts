// Month-over-month comparison for the monthly summary. Pure + testable; the
// page feeds it the two months' category totals.

export interface CategoryTotal {
  name: string;
  color: string;
  value: number;
}

export interface CategoryChange {
  name: string;
  color: string;
  current: number;
  previous: number;
  change: number;
  /** Relative change; null when there was nothing to compare against. */
  changePct: number | null;
}

/**
 * Relative change from `previous` to `current`, e.g. 0.25 for +25%.
 *
 * Null rather than Infinity when the previous period is zero: "new this month"
 * is a different statement from "grew by some percentage", and the page says so.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/**
 * Every category spent in either month, with both totals and the change.
 *
 * A category with nothing this month still appears when it had spending last
 * month — "you spent nothing on X" is part of the comparison, not noise.
 * Sorted by this month's spending, then last month's, so what mattered now
 * leads and what disappeared trails.
 */
export function compareCategories(
  current: CategoryTotal[],
  previous: CategoryTotal[],
): CategoryChange[] {
  const rows = new Map<string, CategoryChange>();
  const row = (c: CategoryTotal) => {
    let r = rows.get(c.name);
    if (!r) {
      r = { name: c.name, color: c.color, current: 0, previous: 0, change: 0, changePct: null };
      rows.set(c.name, r);
    }
    return r;
  };
  for (const c of current) row(c).current += c.value;
  for (const c of previous) row(c).previous += c.value;

  return Array.from(rows.values())
    .map((r) => ({
      ...r,
      change: round2(r.current - r.previous),
      changePct: pctChange(r.current, r.previous),
    }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.name.localeCompare(b.name));
}

/**
 * The comparison window in the previous month.
 *
 * A finished month is compared with the whole previous month. The month in
 * progress is compared with the same number of days of the previous one —
 * ten days of Mehr against all of Shahrivar would always look like a saving.
 */
export function previousWindow(
  monthStart: Date,
  monthEnd: Date,
  prevStart: Date,
  prevEnd: Date,
  now: Date,
): { start: Date; end: Date; partial: boolean } {
  if (now >= monthEnd) return { start: prevStart, end: prevEnd, partial: false };
  const elapsed = Math.max(0, now.getTime() - monthStart.getTime());
  const end = new Date(Math.min(prevStart.getTime() + elapsed, prevEnd.getTime()));
  return { start: prevStart, end, partial: true };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
