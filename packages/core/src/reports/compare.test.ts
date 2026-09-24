import { describe, it, expect } from "vitest";
import { compareCategories, pctChange, previousWindow } from "./compare";

const c = (name: string, value: number) => ({ name, color: "#000", value });
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("pctChange", () => {
  it("is relative to the previous value", () => {
    expect(pctChange(125, 100)).toBe(0.25);
    expect(pctChange(50, 100)).toBe(-0.5);
  });

  it("is null, not Infinity, when there was nothing before", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });

  it("measures against the magnitude of a negative base", () => {
    // Net went from -100 to +100: an improvement, so positive.
    expect(pctChange(100, -100)).toBe(2);
  });
});

describe("compareCategories", () => {
  it("joins both months and keeps categories that vanished", () => {
    const rows = compareCategories([c("خوراک", 300), c("قسط", 500)], [c("خوراک", 200), c("سفر", 900)]);
    expect(rows.map((r) => r.name)).toEqual(["قسط", "خوراک", "سفر"]);
    const food = rows.find((r) => r.name === "خوراک")!;
    expect(food).toMatchObject({ current: 300, previous: 200, change: 100, changePct: 0.5 });
    expect(rows.find((r) => r.name === "قسط")!.changePct).toBeNull(); // new this month
    expect(rows.find((r) => r.name === "سفر")).toMatchObject({ current: 0, previous: 900, change: -900, changePct: -1 });
  });

  it("is empty when neither month has spending", () => {
    expect(compareCategories([], [])).toEqual([]);
  });
});

describe("previousWindow", () => {
  // Mehr 1405 = 23 Sep – 22 Oct 2026; Shahrivar = 23 Aug – 22 Sep.
  const mehr = [d("2026-09-23"), new Date("2026-10-22T23:59:59.999Z")] as const;
  const shahrivar = [d("2026-08-23"), new Date("2026-09-22T23:59:59.999Z")] as const;

  it("compares a finished month with the whole previous month", () => {
    const w = previousWindow(...mehr, ...shahrivar, d("2026-11-01"));
    expect(w).toEqual({ start: shahrivar[0], end: shahrivar[1], partial: false });
  });

  it("compares a month in progress with the same stretch of the previous one", () => {
    const w = previousWindow(...mehr, ...shahrivar, d("2026-10-03")); // 10 days in
    expect(w.partial).toBe(true);
    expect(w.end.toISOString()).toBe("2026-09-02T00:00:00.000Z"); // 10 days into Shahrivar
  });

  it("never runs past the end of a shorter previous month", () => {
    const w = previousWindow(d("2026-01-01"), new Date("2026-01-31T23:59:59Z"),
      d("2025-12-01"), new Date("2025-12-31T23:59:59Z"), new Date("2026-01-31T12:00:00Z"));
    expect(w.end.getTime()).toBeLessThanOrEqual(new Date("2025-12-31T23:59:59Z").getTime());
  });
});
