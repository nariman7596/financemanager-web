import { describe, it, expect } from "vitest";
import { formatMoney, toNumber, formatDate, formatMonthName } from "./index";

describe("formatMoney", () => {
  it("formats a normal ISO currency", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
  });

  // Intl accepts "IRT" (it is well-formed) and prints the literal code with
  // two decimals toman has no sub-unit for, so formatMoney handles it itself.
  it("formats toman with its own symbol, after the amount, with no decimals", () => {
    expect(formatMoney(1234, "IRT")).toBe("1,234 تومان");
  });

  it("rounds toman rather than showing a fractional unit", () => {
    expect(formatMoney(1234.56, "IRT")).toBe("1,235 تومان");
  });

  it("accepts a numeric string (Prisma Decimal serialises as one)", () => {
    expect(formatMoney("1234.5", "USD")).toBe("$1,234.50");
  });

  it("degrades to a zero rather than NaN for unparseable input", () => {
    expect(formatMoney("not a number", "USD")).toBe("$0");
  });

  it("supports compact notation", () => {
    expect(formatMoney(1_500_000, "USD", { compact: true })).toBe("$1.5M");
  });
});

describe("toNumber", () => {
  it("passes numbers through", () => expect(toNumber(12.5)).toBe(12.5));
  it("parses strings", () => expect(toNumber("12.5")).toBe(12.5));
  it("treats null and undefined as zero", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
  it("treats garbage as zero rather than NaN", () => {
    // NaN propagating into a balance renders the whole dashboard blank.
    expect(toNumber("abc")).toBe(0);
    expect(toNumber({})).toBe(0);
  });
  it("reads a Decimal-like object via toString", () => {
    expect(toNumber({ toString: () => "42.75" })).toBe(42.75);
  });
});

describe("formatDate", () => {
  it("renders Gregorian for en", () => {
    expect(formatDate("2026-08-12", "en")).toBe("Aug 12, 2026");
  });

  // 2026-08-12 is 21 Mordad 1405.
  it("renders the Persian calendar for fa", () => {
    const out = formatDate("2026-08-12", "fa");
    expect(out).toContain("مرداد");
    expect(out).toContain("۱۴۰۵");
  });

  // Dates come from <input type="date"> as midnight UTC. Formatting them in a
  // +03:30 zone would push a late-day date onto the next day, so formatDate
  // pins UTC. This asserts the value entered is the value shown back.
  it("does not shift the day across time zones", () => {
    const midnightUtc = new Date("2026-08-12T00:00:00.000Z");
    expect(formatDate(midnightUtc, "en")).toBe("Aug 12, 2026");
    const lateInTheDay = new Date("2026-08-12T23:30:00.000Z");
    expect(formatDate(lateInTheDay, "en")).toBe("Aug 12, 2026");
  });
});

describe("formatMonthName", () => {
  it("names the month in each calendar", () => {
    expect(formatMonthName(new Date("2026-08-12T00:00:00Z"), "en")).toBe("August");
    expect(formatMonthName(new Date("2026-08-12T00:00:00Z"), "fa")).toBe("مرداد");
  });
});
