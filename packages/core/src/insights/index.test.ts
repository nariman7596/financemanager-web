import { describe, expect, it } from "vitest";
import { categoryTrends, repeatingExpenses, unusualExpenses, type Expense } from "./index";

const d = (s: string) => new Date(s + "T00:00:00Z");
let n = 0;
const e = (day: string, amount: number, description: string | null, categoryId: string | null = "c"): Expense => ({
  id: String(++n),
  day: d(day),
  amount,
  description,
  categoryId,
});

describe("repeatingExpenses", () => {
  it("finds a monthly subscription and a weekly habit, with their yearly cost", () => {
    const list = [
      e("2026-06-05", 300_000, "اسنپ‌فود پرو", "food"),
      e("2026-07-05", 300_000, "اسنپ‌فود پرو", "food"),
      e("2026-08-04", 320_000, "اسنپ فود پرو", "food"),
      e("2026-09-05", 300_000, "اسنپ فود پرو", "food"),
      e("2026-09-01", 150_000, "نانوایی", "bread"),
      e("2026-09-08", 140_000, "نانوایی", "bread"),
      e("2026-09-15", 160_000, "نانوایی", "bread"),
      e("2026-09-22", 150_000, "نانوایی", "bread"),
    ];
    const r = repeatingExpenses(list, d("2026-09-26"));
    expect(r.map((x) => [x.label, x.period, x.active])).toEqual([
      ["نانوایی", "WEEKLY", true],
      ["اسنپ فود پرو", "MONTHLY", true],
    ]);
    expect(r[0].perYear).toBe(150_000 * 52);
    expect(r[1]).toMatchObject({ amount: 300_000, perYear: 3_600_000, count: 4, categoryId: "food" });
  });

  it("flags one that stopped, and ignores generic kinds, irregular gaps and unsteady amounts", () => {
    const list = [
      e("2026-04-10", 99_000, "Netflix"),
      e("2026-05-10", 99_000, "Netflix"),
      e("2026-06-10", 99_000, "Netflix"),
      ...["2026-09-01", "2026-09-08", "2026-09-15"].map((x) => e(x, 1000, "خرید")),
      ...["2026-06-01", "2026-06-15", "2026-08-20"].map((x) => e(x, 1000, "irregular")),
      ...["2026-07-01", "2026-08-01", "2026-09-01"].map((x, i) => e(x, [1000, 5000, 1000][i], "wobbly")),
    ];
    const r = repeatingExpenses(list, d("2026-09-26"));
    expect(r.map((x) => [x.label, x.active])).toEqual([["Netflix", false]]);
  });

  it("needs three different days", () => {
    expect(repeatingExpenses([e("2026-08-01", 5, "gym"), e("2026-09-01", 5, "gym"), e("2026-09-01", 5, "gym")], d("2026-09-10"))).toEqual([]);
  });
});

describe("categoryTrends", () => {
  const windows = ["04", "05", "06", "07", "08", "09"].map((m) => ({ start: d(`2026-${m}-01`), end: new Date(d(`2026-${m}-28`).getTime() + 86_399_999) }));
  it("compares the last three months with the three before", () => {
    const list = [
      ...["04", "05", "06"].map((m) => e(`2026-${m}-10`, 100, null, "dining")),
      ...["07", "08", "09"].map((m) => e(`2026-${m}-10`, 180, null, "dining")),
      ...["04", "05", "06", "07", "08", "09"].map((m) => e(`2026-${m}-10`, 1000, null, "rent")),
      e("2026-08-10", 50, null, "new"),
      e("2026-06-10", 999, null, null),
    ];
    const { rising, all } = categoryTrends(list, windows, 10);
    expect(rising.map((c) => c.categoryId)).toEqual(["dining", "new"]);
    expect(rising[0]).toMatchObject({ recent: 180, before: 100, change: 80, pct: 0.8, months: [100, 100, 100, 180, 180, 180] });
    expect(rising[1].pct).toBeNull();
    expect(all[0].categoryId).toBe("rent");
    expect(categoryTrends(list, windows, 100).rising.map((c) => c.categoryId)).toEqual([]);
  });
});

describe("unusualExpenses", () => {
  it("picks a purchase far above what its category usually costs", () => {
    const usual = ["2026-06-01", "2026-06-15", "2026-07-01", "2026-07-15", "2026-08-01", "2026-08-15"].map((x, i) => e(x, 100 + i * 10, null, "groceries"));
    const big = e("2026-09-20", 900, "hyperstar", "groceries");
    const bigButEarly = e("2025-09-01", 900, null, "groceries"); // before the year it is judged against
    const tooFewToJudge = e("2026-09-20", 5000, null, "rare");
    const r = unusualExpenses([...usual, big, bigButEarly, tooFewToJudge, e("2026-09-01", 10, null, "rare")], d("2026-09-01"));
    expect(r).toHaveLength(1);
    expect(r[0].expense).toBe(big);
    expect(r[0].usual).toBe(125);
    expect(r[0].times).toBeCloseTo(7.2, 5);
  });
  it("does not flag an ordinary one", () => {
    const usual = ["2026-06-01", "2026-06-15", "2026-07-01", "2026-07-15", "2026-08-01"].map((x) => e(x, 100, null, "g"));
    expect(unusualExpenses([...usual, e("2026-09-20", 250, null, "g")], d("2026-09-01"))).toEqual([]);
  });
});
