import { describe, it, expect } from "vitest";
import { convert, type RateMap } from "./index";

const rates = (o: Record<string, number>): RateMap => new Map(Object.entries(o));

describe("convert", () => {
  it("is a no-op for the same currency, even with no rates loaded", () => {
    expect(convert(100, "USD", "USD", rates({}))).toBe(100);
  });

  it("uses a direct rate", () => {
    expect(convert(100, "USD", "EUR", rates({ "USD->EUR": 0.9 }))).toBeCloseTo(90);
  });

  it("inverts a rate quoted the other way round", () => {
    expect(convert(90, "EUR", "USD", rates({ "USD->EUR": 0.9 }))).toBeCloseTo(100);
  });

  it("triangulates through USD when neither direction is quoted", () => {
    // The FX feed is USD-based, so most pairs only exist via USD.
    const m = rates({ "USD->EUR": 0.9, "USD->GBP": 0.8 });
    expect(convert(100, "EUR", "GBP", m)).toBeCloseTo((100 / 0.9) * 0.8);
  });

  it("falls back to 1:1 when no path exists", () => {
    expect(convert(100, "AAA", "BBB", rates({}))).toBe(100);
  });

  it("never divides by a zero rate", () => {
    // A zero rate in the table must not produce Infinity in someone's balance.
    expect(Number.isFinite(convert(100, "EUR", "USD", rates({ "USD->EUR": 0 })))).toBe(true);
  });

  // Toman has no ISO code and no feed quotes it; its rate is derived from IRR
  // at exactly 10 rial to the toman. A 10x error here is a serious bug.
  it("converts rial to toman at 10:1", () => {
    const m = rates({ "USD->IRR": 1_000_000, "USD->IRT": 100_000 });
    expect(convert(10_000, "IRR", "IRT", m)).toBeCloseTo(1_000);
    expect(convert(1_000, "IRT", "IRR", m)).toBeCloseTo(10_000);
  });
});
