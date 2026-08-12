-- Which calendar a recurring rule's MONTHLY/YEARLY step is measured in.
--
-- The engine advanced every rule with Gregorian addMonths. For a Persian owner
-- that is wrong 67% of the time, by up to 3 days: a rule set for 15 Mordad
-- posts on 14 Shahrivar, then 13 Mehr. "Monthly" has to mean the same day of
-- the next month in the calendar the owner actually reads.
ALTER TABLE "RecurringTransaction" ADD COLUMN "calendar" TEXT NOT NULL DEFAULT 'GREGORIAN';

-- Backfill from the creating user's UI language so rules that already exist
-- start behaving the way their owner expects, rather than only new ones.
--
-- This only changes how the NEXT date is computed. "nextRunDate" itself is
-- untouched, so nothing is re-posted, nothing is skipped, and no already-posted
-- transaction moves — the effect is bounded to shifting future postings by at
-- most 3 days onto the correct day of the Jalali month.
UPDATE "RecurringTransaction" AS r
SET "calendar" = 'JALALI'
FROM "User" AS u
WHERE r."createdById" = u."id"
  AND u."locale" = 'fa';
