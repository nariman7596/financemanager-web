/**
 * Which notifications to send now. Pure + testable: the app passes what is
 * due (bills, budgets, rows waiting for review), the keys already sent, and
 * the reader's local hour; the words are the app's.
 *
 * Each alert has a key naming the thing and the state it reached, so it is
 * sent once: a bill can remind "in 3 days", then "today", then "late" — each
 * a new key — but never the same one twice. Nothing is sent at night; what
 * falls due then goes out at 08:00 with the next hourly run.
 */

export type AlertKind = "bill" | "budget" | "review";

export interface Alert {
  key: string;
  kind: AlertKind;
  /** What the words are built from. */
  state: "overdue" | "today" | "soon" | "over" | "watch" | "waiting";
  /** The bill, budget or count it is about. */
  ref: string;
  url: string;
}

export interface NotifyInput {
  bills: { id: string; state: string; due: Date }[];
  budgets: { id: string; level: string; start: Date }[];
  waitingReview: number;
  /** The reader's local hour, 0–23. */
  hour: number;
  /** The reader's local day, yyyy-mm-dd. */
  day: string;
}

/** Quiet from 23:00 to 08:00. */
export const QUIET = { from: 23, to: 8 } as const;
/** The daily "waiting for review" nudge goes out from this hour on. */
export const REVIEW_HOUR = 20;

const RANK: Record<Alert["state"], number> = { overdue: 0, today: 1, over: 2, soon: 3, watch: 4, waiting: 5 };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function pickAlerts(input: NotifyInput, sent: Set<string>): Alert[] {
  if (input.hour >= QUIET.from || input.hour < QUIET.to) return [];
  const out: Alert[] = [];
  for (const b of input.bills) {
    if (b.state !== "overdue" && b.state !== "today" && b.state !== "soon") continue;
    out.push({ key: `bill:${b.id}:${ymd(b.due)}:${b.state}`, kind: "bill", state: b.state, ref: b.id, url: "/bills" });
  }
  for (const b of input.budgets) {
    if (b.level !== "over" && b.level !== "watch") continue;
    out.push({ key: `budget:${b.id}:${ymd(b.start)}:${b.level}`, kind: "budget", state: b.level, ref: b.id, url: "/budgets" });
  }
  if (input.waitingReview > 0 && input.hour >= REVIEW_HOUR) {
    out.push({ key: `review:${input.day}`, kind: "review", state: "waiting", ref: String(input.waitingReview), url: "/review" });
  }
  return out.filter((a) => !sent.has(a.key)).sort((a, b) => RANK[a.state] - RANK[b.state]);
}

/**
 * Keys that no longer need keeping: a budget already over does not need its
 * "watch" key to stop a repeat, but keeping everything is cheap — this only
 * says which keys are older than `days`, for the log to be pruned.
 */
export function isStale(sentAt: Date, now: Date, days = 120): boolean {
  return now.getTime() - sentAt.getTime() > days * 24 * 60 * 60 * 1000;
}
