import { describe, expect, it } from "vitest";
import { buildYearCsv, monthlyFlow, monthWindows, savingsRate, yearBounds, yearOf } from "./year";

const d = (s: string) => new Date(s + "T00:00:00Z");
const ymd = (x: Date) => x.toISOString().slice(0, 10);

describe("years", () => {
  it("names the year in the reader's calendar", () => {
    expect(yearOf(d("2026-09-26"), "fa")).toBe(1405);
    expect(yearOf(d("2026-03-20"), "fa")).toBe(1404); // the day before Nowruz 1405
    expect(yearOf(d("2026-09-26"), "en")).toBe(2026);
  });
  it("runs a Persian year from Nowruz, in twelve months", () => {
    const b = yearBounds(1405, "fa");
    expect(ymd(b.start)).toBe("2026-03-21");
    expect(b.end.toISOString()).toBe("2027-03-20T23:59:59.999Z");
    const w = monthWindows(1405, "fa");
    expect(w).toHaveLength(12);
    expect(ymd(w[6].start)).toBe("2026-09-23"); // 1 Mehr
    expect(w[5].end.toISOString()).toBe("2026-09-22T23:59:59.999Z"); // 31 Shahrivar
    expect(ymd(w[11].start)).toBe("2027-02-20"); // 1 Esfand
  });
  it("runs a Gregorian year January to December", () => {
    const w = monthWindows(2026, "en");
    expect(ymd(w[0].start)).toBe("2026-01-01");
    expect(w[1].end.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(yearBounds(2026, "en").end.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
});

describe("monthlyFlow", () => {
  it("buckets income and expense by month and leaves transfers out", () => {
    const w = monthWindows(1405, "fa");
    const m = monthlyFlow(
      [
        { day: d("2026-09-23"), type: "INCOME", amount: 100 },
        { day: d("2026-09-30"), type: "EXPENSE", amount: 30 },
        { day: d("2026-09-22"), type: "EXPENSE", amount: 5 },
        { day: d("2026-09-25"), type: "TRANSFER", amount: 999 },
        { day: d("2026-03-01"), type: "EXPENSE", amount: 999 }, // last year
      ],
      w,
    );
    expect(m[6]).toEqual({ income: 100, expense: 30, net: 70 });
    expect(m[5]).toEqual({ income: 0, expense: 5, net: -5 });
    expect(m.reduce((s, x) => s + x.expense, 0)).toBe(35);
  });
  it("gives the savings rate, or none without income", () => {
    expect(savingsRate(200, 150)).toBe(0.25);
    expect(savingsRate(0, 10)).toBeNull();
  });
});

describe("buildYearCsv", () => {
  it("writes summary, months, categories and holdings", () => {
    const labels = Object.fromEntries(
      ["summary", "income", "expenses", "net", "savingsRate", "worthStart", "worthEnd", "realized", "months", "month", "categories", "category", "amount", "share", "holdings", "holding", "value", "cost", "gain"].map((k) => [k, k]),
    ) as never;
    const csv = buildYearCsv({
      year: 1405,
      base: "IRT",
      labels,
      flow: { income: 200, expense: 150, net: 50 },
      worth: { from: 1000, to: 1100 },
      realized: 12,
      months: [{ label: "فروردین", flow: { income: 200, expense: 150, net: 50 } }],
      categories: [{ name: "خوراکی", value: 150 }],
      holdings: [{ name: "BTC", value: 300, cost: 200 }],
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("summary,1405,IRT");
    expect(lines).toContain("savingsRate,25.0%");
    expect(lines).toContain("worthEnd,1100.00");
    expect(lines).toContain("فروردین,200.00,150.00,50.00");
    expect(lines).toContain("خوراکی,150.00,100.0%");
    expect(lines).toContain("BTC,300.00,200.00,100.00");
  });
});
