import { describe, expect, it } from "vitest";
import { realizedOnReimport, realizedPart, realizedTotals } from "./realized";

describe("realizedPart", () => {
  it("takes cost out in proportion to what was sold", () => {
    expect(realizedPart({ quantity: 1000, cost: 1_200_000 }, 250, 1500, "IRT")).toEqual({ quantity: 250, cost: 300_000, proceeds: 375_000 });
  });
  it("never sells more than is held, and rounds toman to whole units", () => {
    expect(realizedPart({ quantity: 3, cost: 100 }, 5, 40, "IRT")).toEqual({ quantity: 3, cost: 100, proceeds: 120 });
    expect(realizedPart({ quantity: 3, cost: 100 }, 1, 40, "IRT")!.cost).toBe(33);
    expect(realizedPart({ quantity: 3, cost: 100 }, 1, 40.123, "USD")).toEqual({ quantity: 1, cost: 33.33, proceeds: 40.12 });
  });
  it("refuses nonsense", () => {
    expect(realizedPart({ quantity: 0, cost: 0 }, 1, 1)).toBeNull();
    expect(realizedPart({ quantity: 5, cost: 10 }, 0, 1)).toBeNull();
    expect(realizedPart({ quantity: 5, cost: 10 }, 1, -1)).toBeNull();
  });
});

describe("realizedOnReimport", () => {
  const before = { quantity: 10_000, cost: 12_000_000, price: 1_400 };
  it("reads a smaller quantity as a sale at the new closing price", () => {
    expect(realizedOnReimport(before, { quantity: 4_000, price: 1_500 }, "IRT")).toEqual({ quantity: 6_000, cost: 7_200_000, proceeds: 9_000_000 });
  });
  it("prices a symbol that is gone at the last price known", () => {
    expect(realizedOnReimport(before, null, "IRT")).toEqual({ quantity: 10_000, cost: 12_000_000, proceeds: 14_000_000 });
  });
  it("sees nothing sold when the quantity held or grew", () => {
    expect(realizedOnReimport(before, { quantity: 10_000, price: 1_500 })).toBeNull();
    expect(realizedOnReimport(before, { quantity: 12_000, price: 1_500 })).toBeNull();
  });
});

describe("realizedTotals", () => {
  it("adds up the sales in the range", () => {
    const d = (s: string) => new Date(s + "T00:00:00Z");
    const rows = [
      { soldAt: d("2026-09-01"), proceeds: 150, cost: 100 },
      { soldAt: d("2026-09-20"), proceeds: 80, cost: 100 },
      { soldAt: d("2026-10-01"), proceeds: 999, cost: 1 },
    ];
    expect(realizedTotals(rows, d("2026-09-01"), d("2026-09-30"))).toEqual({ proceeds: 230, cost: 200, gain: 30, count: 2 });
  });
});
