import { describe, expect, it } from "vitest";
import { consensusPrice, parseNobitex, parseTabdeal, parseTgju, parseWallex, tgjuItem, tomanIn } from "./index";

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

// Trimmed from what each API returned to the production server, 2026-09-24.
describe("real responses", () => {
  it("reads all three", () => {
    const nobitex = { status: "ok", stats: { "usdt-rls": { isClosed: false, bestSell: "2339810", bestBuy: "2339800", latest: "2339800", mark: "2339800" } } };
    const wallex = {
      result: { symbols: { USDTTMN: { symbol: "USDTTMN", quoteAsset: "TMN", stats: { bidPrice: "234156.0000000000000000", askPrice: "234159.0000000000000000", lastPrice: "234158.0000000000000000" } } } },
    };
    const tabdeal = [{ id: 198735330, price: "233800.0000000000000000", qty: "34.21214700", time: 1790253087775, isBuyerMaker: false }];
    expect(parseNobitex(nobitex, "USDT")).toBe(233980);
    expect(parseWallex(wallex, "USDT")).toBe(234158);
    expect(parseTabdeal(tabdeal, "USDT")).toBe(233800);
    expect(consensusPrice([
      { source: "wallex", price: 234158 },
      { source: "nobitex", price: 233980 },
      { source: "tabdeal", price: 233800 },
    ])?.price).toBe(233980);
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

describe("tgju (gold, coins, foreign cash)", () => {
  // As the production server read it (2026-09-26), cut to a few keys.
  const json = {
    current: {
      zinc: { p: "2575.6", ts: "2021-06-28 14:00:00" },
      sekee: { p: "2,400,100,000", h: "2,400,100,000", ts: "2026-09-24 00:00:00" },
      geram18: { p: "241,246,000", ts: "2026-09-24 00:00:00" },
      price_dollar_rl: { p: "2,346,150", ts: "2026-09-24 00:00:00" },
    },
  };
  const now = new Date("2026-09-26T01:00:00Z");
  it("reads rial per unit as toman", () => {
    expect(parseTgju(json, "sekee", now)?.toman).toBe(240010000);
    expect(parseTgju(json, "geram18", now)?.toman).toBe(24124600);
    expect(parseTgju(json, "price_dollar_rl", now)?.toman).toBe(234615);
  });
  it("ignores a stale key and one that is missing", () => {
    expect(parseTgju(json, "zinc", now)).toBeNull();
    expect(parseTgju(json, "nim", now)).toBeNull();
    expect(parseTgju(null, "sekee", now)).toBeNull();
  });
  it("maps a price source to its item", () => {
    expect(tgjuItem("tgju:geram18")?.symbol).toBe("GOLD18");
    expect(tgjuItem("tgju:zinc")).toBeUndefined();
    expect(tgjuItem(null)).toBeUndefined();
  });
});
