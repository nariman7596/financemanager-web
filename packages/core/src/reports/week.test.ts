import { describe, expect, it } from "vitest";
import { addWeeks, dailyTotals, defaultSummaryWeek, weekEnd, weekFromKey, weekKey, weekStart, worthChange } from "./week";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("weekStart", () => {
  it("starts a Persian week on Saturday and an English one on Monday", () => {
    // 2026-09-26 is a Saturday (5 Mehr 1405).
    expect(weekKey(weekStart(d("2026-09-26"), "fa"))).toBe("2026-09-26");
    expect(weekKey(weekStart(d("2026-10-02"), "fa"))).toBe("2026-09-26"); // Friday
    expect(weekKey(weekStart(d("2026-10-03"), "fa"))).toBe("2026-10-03");
    expect(weekKey(weekStart(d("2026-09-26"), "en"))).toBe("2026-09-21");
    expect(weekKey(weekStart(d("2026-09-27"), "en"))).toBe("2026-09-21"); // Sunday
  });
  it("ignores the time of day", () => {
    expect(weekKey(weekStart(new Date("2026-10-02T23:59:59Z"), "fa"))).toBe("2026-09-26");
  });
  it("ends at the last instant of the seventh day", () => {
    expect(weekEnd(d("2026-09-26")).toISOString()).toBe("2026-10-02T23:59:59.999Z");
    expect(weekKey(addWeeks(d("2026-09-26"), -1))).toBe("2026-09-19");
  });
});

describe("weekFromKey", () => {
  it("snaps any day to its week and refuses what is not a date", () => {
    expect(weekKey(weekFromKey("2026-09-30", "fa")!)).toBe("2026-09-26");
    expect(weekFromKey("2026-13-40", "fa")).toBeNull();
    expect(weekFromKey("x", "fa")).toBeNull();
    expect(weekFromKey(undefined, "fa")).toBeNull();
  });
});

describe("defaultSummaryWeek", () => {
  it("opens on the week just ended for its first two days, and nudges", () => {
    expect(defaultSummaryWeek(d("2026-09-26"), "fa")).toEqual({ start: d("2026-09-19"), nudge: true }); // Saturday
    expect(defaultSummaryWeek(d("2026-09-27"), "fa")).toEqual({ start: d("2026-09-19"), nudge: true });
  });
  it("opens on the week in progress, nudging on its last day", () => {
    expect(defaultSummaryWeek(d("2026-09-28"), "fa")).toEqual({ start: d("2026-09-26"), nudge: false });
    expect(defaultSummaryWeek(d("2026-10-02"), "fa")).toEqual({ start: d("2026-09-26"), nudge: true }); // Friday
  });
});

describe("dailyTotals", () => {
  it("puts each expense on its day and leaves the other days at zero", () => {
    const days = dailyTotals(d("2026-09-26"), [
      { day: d("2026-09-26"), value: 10 },
      { day: new Date("2026-09-26T15:00:00Z"), value: 5.5 },
      { day: d("2026-10-02"), value: 3 },
      { day: d("2026-10-03"), value: 99 }, // next week
      { day: d("2026-09-25"), value: 99 }, // last week
    ]);
    expect(days.map((x) => x.value)).toEqual([15.5, 0, 0, 0, 0, 0, 3]);
    expect(weekKey(days[6].day)).toBe("2026-10-02");
  });
});

describe("worthChange", () => {
  const points = [
    { day: "2026-09-24", total: 100 },
    { day: "2026-09-25", total: 110 },
    { day: "2026-09-26", total: 120 },
    { day: "2026-09-28", total: 90 },
  ];
  it("measures from the day before the week to its last recorded day", () => {
    expect(worthChange(points, d("2026-09-26"), weekEnd(d("2026-09-26")))).toEqual({ from: 110, to: 90, change: -20 });
  });
  it("is null when the history starts inside the week", () => {
    expect(worthChange(points, d("2026-09-19"), weekEnd(d("2026-09-19")))).toBeNull();
    expect(worthChange([], d("2026-09-26"), weekEnd(d("2026-09-26")))).toBeNull();
  });
});
