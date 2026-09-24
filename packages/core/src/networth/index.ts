/**
 * The household's worth over time.
 *
 * Cash can be rebuilt exactly for any past day: the opening balances plus
 * every income and minus every expense up to that day (a transfer between two
 * of the household's own accounts, a person's or a loan's included, moves
 * nothing out of the total). What holdings were worth on a past day cannot be
 * rebuilt — that is what the daily snapshots keep. Before the first snapshot a
 * holding counts at what was paid for it, from its purchase date; from the
 * first snapshot on, at its market value that day (carried forward over days
 * without one).
 *
 * Pure: amounts are already in one currency, days are midnight UTC.
 */

const DAY = 24 * 60 * 60 * 1000;

export interface NetWorthInput {
  /** Sum of the accounts' opening balances. */
  opening: number;
  /** +income / −expense per transaction, by its day. */
  flows: { day: Date; delta: number }[];
  /** Own holdings at cost, from their purchase day (before any snapshot). */
  holdings: { since: Date; cost: number }[];
  snapshots: { day: Date; investments: number; usdRate: number | null }[];
}

export interface NetWorthPoint {
  day: Date;
  cash: number;
  investments: number;
  total: number;
  /** The total in dollars at that day's rate; null before any rate is known. */
  usd: number | null;
}

export function dayOf(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY) * DAY);
}

/**
 * Up to `maxPoints` days from `from` to `to`, evenly spaced, always ending on
 * `to` so the last point is today.
 */
export function sampleDays(from: Date, to: Date, maxPoints: number): Date[] {
  const a = dayOf(from).getTime();
  const b = dayOf(to).getTime();
  if (b < a) return [new Date(b)];
  const days = Math.round((b - a) / DAY) + 1;
  const step = Math.max(1, Math.ceil(days / Math.max(2, maxPoints)));
  const out: Date[] = [];
  for (let t = b; t >= a; t -= step * DAY) out.push(new Date(t));
  return out.reverse();
}

export function netWorthSeries(input: NetWorthInput, days: Date[]): NetWorthPoint[] {
  const flows = [...input.flows].sort((x, y) => x.day.getTime() - y.day.getTime());
  const snaps = [...input.snapshots].sort((x, y) => x.day.getTime() - y.day.getTime());
  const firstSnap = snaps[0]?.day.getTime() ?? Infinity;
  let fi = 0;
  let si = -1;
  let cash = input.opening;
  const out: NetWorthPoint[] = [];
  for (const d of [...days].sort((x, y) => x.getTime() - y.getTime())) {
    const end = dayOf(d).getTime();
    while (fi < flows.length && dayOf(flows[fi].day).getTime() <= end) cash += flows[fi++].delta;
    while (si + 1 < snaps.length && dayOf(snaps[si + 1].day).getTime() <= end) si++;
    const snap = si >= 0 ? snaps[si] : null;
    const investments =
      end >= firstSnap && snap
        ? snap.investments
        : input.holdings.filter((h) => dayOf(h.since).getTime() <= end).reduce((s, h) => s + h.cost, 0);
    const total = cash + investments;
    // The latest known rate on or before the day.
    let rate: number | null = null;
    for (let k = si; k >= 0; k--) {
      if (snaps[k].usdRate && snaps[k].usdRate! > 0) {
        rate = snaps[k].usdRate!;
        break;
      }
    }
    out.push({ day: new Date(end), cash, investments, total, usd: rate ? total / rate : null });
  }
  return out;
}

/** First to last point: the change and, when the start is positive, as a share of it. */
export function seriesChange(values: number[]): { change: number; pct: number | null } | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return { change: last - first, pct: first > 0 ? (last - first) / first : null };
}
