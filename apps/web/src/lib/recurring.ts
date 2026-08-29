import "server-only";
import { addDays, addWeeks } from "date-fns";
import { addMonthsInCalendar, addYearsInCalendar } from "@financemanager/core/calendar";
import { prisma } from "@financemanager/db";

// ---------------------------------------------------------------------------
// Recurring auto-posting engine.
//
// Active RecurringTransaction rules whose `nextRunDate` is due (<= asOf) get
// materialized into real Transactions. If a rule is behind (e.g. the app/cron
// didn't run for a while), it catches up by posting each missed occurrence,
// advancing `nextRunDate` each time — capped to avoid runaway loops.
// ---------------------------------------------------------------------------

const MAX_CATCHUP_PER_RULE = 366; // safety cap (≥ a year of daily posts)

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/**
 * Advance a date by `interval` units of `frequency`, in the rule's calendar.
 *
 * Days and weeks are fixed spans, so the calendar is irrelevant to them. Months
 * and years are not: a Jalali month is 31, 30 or 29 days depending on where it
 * falls, so stepping a Persian owner's rule with Gregorian months lands on the
 * wrong day 67% of the time, by up to 3 days — 15 Mordad becomes 14 Shahrivar,
 * then 13 Mehr. `calendar` comes from the rule row, not from the reader.
 */
export function advance(
  date: Date,
  frequency: string,
  interval: number,
  calendar: string = "GREGORIAN",
): Date {
  const n = Math.max(1, interval);
  switch (frequency as Frequency) {
    case "DAILY":
      return addDays(date, n);
    case "WEEKLY":
      return addWeeks(date, n);
    case "MONTHLY":
      return addMonthsInCalendar(date, n, calendar);
    case "YEARLY":
      return addYearsInCalendar(date, n, calendar);
    default:
      return addMonthsInCalendar(date, n, calendar);
  }
}

export type PostSummary = { rules: number; posted: number };

/**
 * Post all due occurrences. Pass a householdId to scope to one household (used
 * by the in-app "Run now" button), or omit to process every household (cron).
 */
export async function postDueRecurring(
  householdId?: string,
  asOf: Date = new Date(),
): Promise<PostSummary> {
  const rules = await prisma.recurringTransaction.findMany({
    where: {
      isActive: true,
      nextRunDate: { lte: asOf },
      ...(householdId ? { householdId } : {}),
    },
  });

  let posted = 0;
  let touched = 0;

  for (const rule of rules) {
    let next = rule.nextRunDate;
    let count = 0;
    const created: { date: Date }[] = [];

    // Collect due occurrences up to asOf (and not past endDate).
    while (
      next <= asOf &&
      (!rule.endDate || next <= rule.endDate) &&
      count < MAX_CATCHUP_PER_RULE
    ) {
      created.push({ date: next });
      next = advance(next, rule.frequency, rule.interval, rule.calendar);
      count++;
    }

    if (created.length === 0) continue;

    // Whether the rule has now finished (advanced past its end date).
    const finished = !!rule.endDate && next > rule.endDate;

    // Post occurrences + advance the rule atomically per-rule.
    await prisma.$transaction([
      prisma.transaction.createMany({
        data: created.map((c) => ({
          householdId: rule.householdId,
          createdById: rule.createdById,
          accountId: rule.accountId,
          categoryId: rule.type === "TRANSFER" ? null : rule.categoryId,
          transferAccountId:
            rule.type === "TRANSFER" ? rule.transferAccountId : null,
          type: rule.type,
          amount: rule.amount,
          currency: rule.currency,
          date: c.date,
          description: rule.description,
          notes: rule.notes,
          recurringId: rule.id,
        })),
      }),
      prisma.recurringTransaction.update({
        where: { id: rule.id },
        data: {
          nextRunDate: next,
          lastPosted: created[created.length - 1].date,
          isActive: finished ? false : true,
        },
      }),
    ]);

    posted += created.length;
    touched++;
  }

  return { rules: touched, posted };
}
