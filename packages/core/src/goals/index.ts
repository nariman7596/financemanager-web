/**
 * Savings goals: how far along each is, what it needs each month to arrive on
 * time, and how the monthly savings the budget planner sets aside are shared
 * between them.
 *
 * Pure: amounts are in the goal's own currency (the app converts before
 * calling), dates are instants.
 */

export type GoalStatus = "done" | "onTrack" | "behind" | "overdue" | "open";

export interface GoalInput {
  target: number;
  saved: number;
  targetDate: Date | null;
}

export interface GoalProgress {
  /** 0–1, capped at 1. */
  share: number;
  remaining: number;
  /** Whole months left until the target date (at least 1 while it is ahead); null without a date. */
  monthsLeft: number | null;
  /** What has to be put aside each month from now on to arrive on time; null without a date. */
  perMonth: number | null;
  status: GoalStatus;
}

const DAY = 24 * 60 * 60 * 1000;
const MONTH = 30.44 * DAY;

/**
 * Where a goal stands. "behind" needs a pace to compare against: the share of
 * the time between the goal's start and its date that has passed, against the
 * share of the money saved — a goal a third of the way through its time with a
 * tenth of its money is behind, whatever is left.
 */
export function goalProgress(g: GoalInput, now: Date, start?: Date): GoalProgress {
  const target = Math.max(0, g.target);
  const saved = Math.max(0, g.saved);
  const remaining = Math.max(0, target - saved);
  const share = target > 0 ? Math.min(1, saved / target) : 1;
  if (remaining === 0) {
    return { share, remaining: 0, monthsLeft: g.targetDate ? monthsBetween(now, g.targetDate) : null, perMonth: 0, status: "done" };
  }
  if (!g.targetDate) return { share, remaining, monthsLeft: null, perMonth: null, status: "open" };
  if (g.targetDate.getTime() <= now.getTime()) {
    return { share, remaining, monthsLeft: 0, perMonth: remaining, status: "overdue" };
  }
  const monthsLeft = monthsBetween(now, g.targetDate);
  let status: GoalStatus = "onTrack";
  if (start && start.getTime() < now.getTime() && start.getTime() < g.targetDate.getTime()) {
    const timeShare = (now.getTime() - start.getTime()) / (g.targetDate.getTime() - start.getTime());
    // A little slack: a month's saving has not landed yet is not "behind".
    if (share + 0.05 < timeShare) status = "behind";
  }
  return { share, remaining, monthsLeft, perMonth: remaining / monthsLeft, status };
}

/** Whole months from `a` to `b`, rounded up, at least 1. */
export function monthsBetween(a: Date, b: Date): number {
  return Math.max(1, Math.ceil((b.getTime() - a.getTime()) / MONTH - 1e-9));
}

export interface SplitGoal {
  id: string;
  remaining: number;
  /** Months left; null for a goal without a date. */
  monthsLeft: number | null;
}

export interface GoalSplit {
  /** Per goal: what to put aside this month. */
  amounts: Record<string, number>;
  /** What the dated goals need in total each month. */
  needed: number;
  /** Savings short of what the dated goals need (0 when they fit). */
  shortfall: number;
  /** Savings left after every goal got what it needs or wants. */
  spare: number;
}

/**
 * Share a month's savings between goals. Goals with a date need
 * remaining ÷ months left; they come first, the nearest date first when there
 * is not enough for all (a goal due next month cannot wait, one due in two
 * years can catch up). Goals without a date split what is left evenly, never
 * more than they still need.
 */
export function splitSavings(monthly: number, goals: SplitGoal[]): GoalSplit {
  const amounts: Record<string, number> = {};
  let left = Math.max(0, monthly);
  const dated = goals
    .filter((g) => g.monthsLeft !== null && g.remaining > 0)
    .sort((a, b) => a.monthsLeft! - b.monthsLeft!);
  const needed = dated.reduce((s, g) => s + g.remaining / g.monthsLeft!, 0);
  for (const g of dated) {
    const want = g.remaining / g.monthsLeft!;
    const give = Math.min(want, left);
    amounts[g.id] = give;
    left -= give;
  }
  const open = goals.filter((g) => g.monthsLeft === null && g.remaining > 0);
  // Even shares, handing what a nearly-finished goal does not need to the rest.
  let pending = [...open];
  while (left > 1e-6 && pending.length > 0) {
    const each = left / pending.length;
    const next: SplitGoal[] = [];
    for (const g of pending) {
      const have = amounts[g.id] ?? 0;
      const give = Math.min(each, g.remaining - have);
      amounts[g.id] = have + give;
      left -= give;
      if (g.remaining - amounts[g.id] > 1e-6) next.push(g);
    }
    if (next.length === pending.length) break;
    pending = next;
  }
  for (const g of goals) amounts[g.id] ??= 0;
  return { amounts, needed, shortfall: Math.max(0, needed - Math.max(0, monthly)), spare: Math.max(0, left) };
}
