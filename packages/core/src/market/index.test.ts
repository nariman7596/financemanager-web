import { describe, expect, it } from "vitest";
import { consensusPrice, parseNobitex, parseTabdeal, parseWallex, tomanIn } from "./index";

describe("exchange parsers", () => {
  it("reads Nobitex's rial price as toman", () => {
    const json = { status: "ok", stats: { "usdt-rls": { isClosed: false, latest: "1143480", bestSell: "1143500" } } };
    expect(parseNobitex(json, "USDT")).toBe(114348);
    expect(parseNobitex({ stats: { "usdt-rls": { bestSell: "1143500" } } }, "usdt")).toBe(114350);
    expect(parseNobitex({ stats: { "usdt-rls": { isClosed: true, latest: "1" } } }, "USDT")).toBeNull();
  });

  it("reads Wallex's toman market", () => {
    const json = { result: { symbols: { USDTTMN: { stats: { lastPrice: "114,350", askPrice: "114400" } } } }, success: true };
    expect(parseWallex(json, "usdt")).toBe(114350);
    expect(parseWallex({ result: { symbols: { USDTTMN: { stats: { lastPrice: "-", askPrice: "114400" } } } } }, "USDT")).toBe(114400);
  });

  it("reads Tabdeal's ticker, alone or in a list", () => {
    expect(parseTabdeal({ symbol: "USDTIRT", price: "114300" }, "USDT")).toBe(114300);
    expect(parseTabdeal([{ symbol: "BTCIRT", price: "9" }, { symbol: "USDT_IRT", price: "114300" }], "USDT")).toBe(114300);
  });

  it("returns null for anything unexpected rather than a wrong number", () => {
    for (const bad of [null, "html", {}, { result: {} }, { stats: { "usdt-rls": { latest: "0" } } }, [{ symbol: "BTCIRT", price: "9" }]]) {
      expect(parseNobitex(bad, "USDT")).toBeNull();
      expect(parseWallex(bad, "USDT")).toBeNull();
      expect(parseTabdeal(bad, "USDT")).toBeNull();
    }
  });
});

describe("consensusPrice", () => {
  it("takes the median", () => {
    expect(consensusPrice([
      { source: "wallex", price: 114350 },
      { source: "nobitex", price: 114348 },
      { source: "tabdeal", price: 114600 },
    ])).toEqual({ price: 114350, used: ["wallex", "nobitex", "tabdeal"] });
    expect(consensusPrice([{ source: "a", price: 100 }, { source: "b", price: 110 }])?.price).toBe(105);
  });

  it("drops a quote far from the others (rial read as toman)", () => {
    const r = consensusPrice([
      { source: "wallex", price: 114350 },
      { source: "nobitex", price: 1143480 },
      { source: "tabdeal", price: 114300 },
    ]);
    expect(r).toEqual({ price: 114325, used: ["wallex", "tabdeal"] });
  });

  it("is null when no exchange answered", () => {
    expect(consensusPrice([])).toBeNull();
  });
});

describe("tomanIn", () => {
  it("prices in toman or rial, nothing else", () => {
    expect(tomanIn("IRT", 114350)).toBe(114350);
    expect(tomanIn("IRR", 114350)).toBe(1143500);
    expect(tomanIn("USD", 114350)).toBeNull();
  });
});
