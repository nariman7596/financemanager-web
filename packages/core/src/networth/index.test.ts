import { describe, expect, it } from "vitest";
import { netWorthSeries, sampleDays, seriesChange } from "./index";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("sampleDays", () => {
  it("covers the range, ends on the last day, and stays under the cap", () => {
    const days = sampleDays(d("2026-01-01"), d("2026-12-31"), 60);
    expect(days.at(-1)).toEqual(d("2026-12-31"));
    expect(days.length).toBeLessThanOrEqual(60);
    expect(days[0].getTime()).toBeGreaterThanOrEqual(d("2026-01-01").getTime());
  });

  it("gives every day for a short range", () => {
    expect(sampleDays(d("2026-09-20"), d("2026-09-24"), 60)).toHaveLength(5);
  });
});

describe("netWorthSeries", () => {
  const input = {
    opening: 1000,
    flows: [
      { day: d("2026-09-02"), delta: 500 }, // salary
      { day: d("2026-09-03"), delta: -200 }, // rent
      { day: d("2026-09-10"), delta: -50 },
    ],
    holdings: [{ since: d("2026-09-05"), cost: 300 }],
    snapshots: [
      { day: d("2026-09-08"), investments: 330, usdRate: 100 },
      { day: d("2026-09-12"), investments: 360, usdRate: 120 },
    ],
  };
  const days = [d("2026-09-01"), d("2026-09-03"), d("2026-09-06"), d("2026-09-08"), d("2026-09-10"), d("2026-09-12")];
  const s = netWorthSeries(input, days);

  it("rebuilds cash from opening and income/expense by day", () => {
    expect(s.map((p) => p.cash)).toEqual([1000, 1300, 1300, 1300, 1250, 1250]);
  });

  it("counts holdings at cost before the first snapshot, at snapshot value after (carried forward)", () => {
    expect(s.map((p) => p.investments)).toEqual([0, 0, 300, 330, 330, 360]);
  });

  it("reads the total in dollars from the latest known rate only", () => {
    expect(s[2].usd).toBeNull();
    expect(s[3].usd).toBeCloseTo(1630 / 100);
    expect(s[4].usd).toBeCloseTo(1580 / 100);
    expect(s[5].usd).toBeCloseTo(1610 / 120);
  });
});

describe("seriesChange", () => {
  it("is last minus first, with a share when the start is positive", () => {
    expect(seriesChange([100, 90, 150])).toEqual({ change: 50, pct: 0.5 });
    expect(seriesChange([0, 10])).toEqual({ change: 10, pct: null });
    expect(seriesChange([5])).toBeNull();
  });
});
