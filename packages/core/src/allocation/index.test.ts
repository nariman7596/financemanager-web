import { describe, expect, it } from "vitest";
import { allocate, classOf, parseTargets } from "./index";

describe("classOf", () => {
  it("files by exposure, not by instrument", () => {
    expect(classOf({ type: "GOLD", symbol: "SEKEE", name: "سکه امامی" })).toBe("GOLD");
    expect(classOf({ type: "FX", symbol: "USD", name: "دلار" })).toBe("USD");
    expect(classOf({ type: "CRYPTO", symbol: "USDT", name: "Tether" })).toBe("USD");
    expect(classOf({ type: "CRYPTO", symbol: "paxg", name: "PAX Gold" })).toBe("GOLD");
    expect(classOf({ type: "CRYPTO", symbol: "NEAR", name: "NEAR" })).toBe("CRYPTO");
    expect(classOf({ type: "ETF", symbol: "زرفام", name: "صندوق س.کالای آشنا" })).toBe("GOLD");
    expect(classOf({ type: "ETF", symbol: "دارونو", name: "صندوق صنعت دارو مفید - بخشی" })).toBe("STOCK");
    expect(classOf({ type: "STOCK", symbol: "فارس", name: "صنایع پتروشیمی خلیج فارس" })).toBe("STOCK");
    expect(classOf({ type: "REAL_ESTATE", symbol: "HOME", name: "خانه" })).toBe("OTHER");
  });
  it("keeps the owner's own choice", () => {
    expect(classOf({ type: "ETF", symbol: "X", name: "صندوق س.کالای X", allocClass: "STOCK" })).toBe("STOCK");
    expect(classOf({ type: "ETF", symbol: "X", name: "صندوق س.کالای X", allocClass: "nonsense" })).toBe("GOLD");
  });
});

describe("allocate", () => {
  it("sums by class, drops debts, and measures against targets", () => {
    const { total, rows } = allocate(
      [
        { cls: "GOLD", value: 300 },
        { cls: "GOLD", value: 100 },
        { cls: "STOCK", value: 400 },
        { cls: "CASH", value: 200 },
        { cls: "CASH", value: -50 },
      ],
      { GOLD: 30, STOCK: 30, CASH: 20, USD: 20 },
    );
    expect(total).toBe(1000);
    expect(rows.map((r) => [r.cls, r.value, r.share])).toEqual([
      ["GOLD", 400, 0.4],
      ["STOCK", 400, 0.4],
      ["CASH", 200, 0.2],
      ["USD", 0, 0],
    ]);
    expect(rows.find((r) => r.cls === "GOLD")!.toTarget).toBeCloseTo(-100);
    expect(rows.find((r) => r.cls === "USD")!.toTarget).toBeCloseTo(200);
    expect(rows.find((r) => r.cls === "CASH")!.toTarget).toBeCloseTo(0);
  });
  it("has nothing to share when there is nothing", () => {
    expect(allocate([])).toEqual({ total: 0, rows: [] });
  });
});

describe("parseTargets", () => {
  it("accepts percentages that add up to 100", () => {
    expect(parseTargets({ GOLD: "40", STOCK: 30, CASH: 30, USD: "" })).toEqual({ GOLD: 40, STOCK: 30, CASH: 30 });
  });
  it("refuses ones that do not", () => {
    expect(parseTargets({ GOLD: 50, STOCK: 30 })).toBeNull();
    expect(parseTargets({ GOLD: 150, STOCK: -50 })).toBeNull();
    expect(parseTargets(null)).toBeNull();
  });
});
