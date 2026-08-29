import { describe, it, expect } from "vitest";
import {
  startOfMonthIn,
  endOfMonthIn,
  subMonthsIn,
  addMonthsInCalendar,
  addYearsInCalendar,
  monthKeyIn,
  toJalaliParts,
  fromJalaliParts,
  daysInJalaliMonth,
} from "./index";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ymd = (x: Date) => x.toISOString().slice(0, 10);

// The reference facts for Jalali 1405 (Nowruz 1405 = 21 March 2026):
//   Mordad 1405     23 Jul 2026 – 22 Aug 2026   (month 5, 31 days)
//   Shahrivar 1405  23 Aug 2026 – 22 Sep 2026
//   Dey 1405        22 Dec 2026 – 20 Jan 2027   (month 10, 30 days)
describe("month boundaries", () => {
  it("uses the Gregorian month for en", () => {
    expect(ymd(startOfMonthIn(d("2026-08-12"), "en"))).toBe("2026-08-01");
    expect(ymd(endOfMonthIn(d("2026-08-12"), "en"))).toBe("2026-08-31");
  });

  // This is the whole reason calendar.ts exists. "This month" for a Persian
  // reader is Mordad, not August; bucketing an August total and labelling it
  // مرداد would misreport it.
  it("uses the Jalali month for fa", () => {
    expect(ymd(startOfMonthIn(d("2026-08-12"), "fa"))).toBe("2026-07-23");
    expect(ymd(endOfMonthIn(d("2026-08-12"), "fa"))).toBe("2026-08-22");
  });

  it("gives genuinely different buckets for the same instant", () => {
    const at = d("2026-08-12");
    expect(ymd(startOfMonthIn(at, "en"))).not.toBe(ymd(startOfMonthIn(at, "fa")));
  });

  it("steps back a Jalali month, not a Gregorian one", () => {
    // One month before 12 Aug (21 Mordad) is 21 Tir = 12 Jul.
    expect(ymd(startOfMonthIn(subMonthsIn(d("2026-08-12"), 1, "fa"), "fa")))
      .toBe("2026-06-22"); // 1 Tir 1405
  });
});

describe("addMonthsInCalendar", () => {
  // The recurring-rule bug: a rule set for a day in Dey must post on the same
  // day of Bahman. Dey has 30 days where December has 31, so stepping by a
  // Gregorian month lands a day late.
  it("differs from the Gregorian step where month lengths differ", () => {
    const start = d("2026-12-22"); // 1 Dey 1405
    expect(ymd(addMonthsInCalendar(start, 1, "JALALI"))).toBe("2027-01-21"); // 1 Bahman
    expect(ymd(addMonthsInCalendar(start, 1, "GREGORIAN"))).toBe("2027-01-22");
  });

  it("agrees with Gregorian where the two happen to coincide", () => {
    const start = d("2026-07-23"); // 1 Mordad, and Mordad is 31 days like July
    expect(ymd(addMonthsInCalendar(start, 1, "JALALI"))).toBe("2026-08-23");
  });

  // Asserted through the Jalali parts rather than a hand-computed Gregorian
  // date: "+1 Jalali year" means the same day and month of the next Jalali
  // year, whatever that lands on in Gregorian terms.
  it("steps a Jalali year, keeping the Jalali day and month", () => {
    const before = toJalaliParts("2026-08-12")!;
    const after = toJalaliParts(ymd(addYearsInCalendar(d("2026-08-12"), 1, "JALALI")))!;
    expect(after).toEqual({ ...before, year: before.year + 1 });
  });
});

describe("month keys", () => {
  it("produces a stable, sortable key per calendar", () => {
    const at = d("2026-08-12");
    expect(monthKeyIn(at, "en")).not.toBe(monthKeyIn(at, "fa"));
    // Two instants in the same Jalali month must share a key, or the report
    // splits one month into two buckets.
    expect(monthKeyIn(d("2026-07-23"), "fa")).toBe(monthKeyIn(d("2026-08-22"), "fa"));
    expect(monthKeyIn(d("2026-08-22"), "fa")).not.toBe(monthKeyIn(d("2026-08-23"), "fa"));
  });
});

describe("Jalali parts (the date input)", () => {
  it("round-trips a Gregorian date through Jalali parts", () => {
    const parts = toJalaliParts("2026-08-12");
    expect(parts).toEqual({ year: 1405, month: 5, day: 21 });
    expect(fromJalaliParts(parts!)).toBe("2026-08-12");
  });

  it("rejects an unparseable date", () => {
    expect(toJalaliParts("not-a-date")).toBeNull();
  });

  it("knows the long and short Jalali months", () => {
    expect(daysInJalaliMonth(1405, 1)).toBe(31);  // Farvardin
    expect(daysInJalaliMonth(1405, 7)).toBe(30);  // Mehr
  });

  // Esfand is 29 days most years and 30 in a leap year. Getting this wrong
  // makes the date picker refuse a real date.
  it("handles Esfand's leap-year length", () => {
    const lengths = new Set(
      [1403, 1404, 1405, 1406, 1407, 1408].map((y) => daysInJalaliMonth(y, 12)),
    );
    expect(lengths).toContain(29);
    expect(lengths).toContain(30);
  });
});
