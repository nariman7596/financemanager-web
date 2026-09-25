import { describe, expect, it } from "vitest";
import { parseBrokerPortfolio, parseRahavardAsset, parseRahavardSearch, parseSharedStrings, parseSheetXml } from "./broker";

// The shape of Mofid Easytrader's "Portfolio export": string cells (t="str"),
// a header with a stray leading space, forty-odd columns. Figures invented.
const H = ["نام نماد", "تاریخ آخرین تراکنش و رویداد", "تعداد دارایی", "تعداد سهام جایزه", "ارزش فعلی", "آخرین قیمت", " قیمت پایانی", "سود و زیان فعلی", "قیمت میانگین خرید در آخرین دوره با لحاظ کارمزد", "توضیح نماد"];
// Easytrader writes each value as <v xml:space="preserve">.
const cell = (col: string, row: number, v: string) => `<c r="${col}${row}" t="str"><v xml:space="preserve">${v}</v></c>`;
const COLS = "ABCDEFGHIJ".split("");
const row = (n: number, vals: string[]) => `<row r="${n}">${vals.map((v, i) => cell(COLS[i], n, v)).join("")}</row>`;
const xml = `<?xml version="1.0"?><worksheet><sheetData>${[
  row(1, H),
  row(2, ["خودرو", "14050629", "1000", "0", "2478960", "2500", "2510", "478960", "2000", "ایران خودرو"]),
  row(3, ["طلا", "14050215", "300", "0", "5947200", "20000", "0", "947200", "16500", "صندوق س.کالای نمونه &amp; شرکا"]),
  row(4, ["فروخته", "14040101", "0", "0", "0", "100", "100", "0", "90", "فروخته شده"]),
].join("")}</sheetData></worksheet>`;

describe("broker portfolio export", () => {
  it("reads the table by header, not position", () => {
    const got = parseBrokerPortfolio(parseSheetXml(xml));
    expect(got).toEqual([
      { symbol: "خودرو", name: "ایران خودرو", quantity: 1000, priceRial: 2510, avgCostRial: 2000, isFund: false },
      // No closing price yet: the last trade stands in.
      { symbol: "طلا", name: "صندوق س.کالای نمونه & شرکا", quantity: 300, priceRial: 20000, avgCostRial: 16500, isFund: true },
    ]);
  });

  it("refuses a file that is not a portfolio export", () => {
    expect(parseBrokerPortfolio([["a", "b"], ["1", "2"]])).toBeNull();
    expect(parseBrokerPortfolio([])).toBeNull();
  });

  it("reads shared and inline strings and skips empty cells", () => {
    const shared = parseSharedStrings(`<sst><si><t>نام نماد</t></si><si><r><t>تعداد </t></r><r><t>دارایی</t></r></si></sst>`);
    expect(shared).toEqual(["نام نماد", "تعداد دارایی"]);
    const rows = parseSheetXml(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>x</t></is></c><c r="D1"><v>42</v></c></row>`,
      shared,
    );
    expect(rows).toEqual([["نام نماد", "", "x", "42"]]);
  });
});

describe("rahavard365", () => {
  it("finds exactly the symbol, not a longer one", () => {
    // As the production server read a search (2026-09-26), cut down.
    const json = {
      data: [
        { type: "سهام", entity_id: "453", entity_type: "exchange.asset", trade_symbol: "فولاد", name: "فولاد مبارکه اصفهان" },
        { type: "حق تقدم", entity_id: "1045", entity_type: "exchange.asset", trade_symbol: "فولادح" },
      ],
    };
    expect(parseRahavardSearch(json, "فولاد")).toBe("453");
    expect(parseRahavardSearch(json, "فولادح")).toBe("1045");
    expect(parseRahavardSearch(json, "فارس")).toBeNull();
    expect(parseRahavardSearch({ errors: [] }, "فولاد")).toBeNull();
  });

  it("reads the closing price, the one the broker values at", () => {
    const json = {
      data: {
        last_trade: { end_date_time: "2026-09-23T12:29:59+03:30", close_price: 12140, real_close_price: 12100, open_price: 12600 },
      },
    };
    expect(parseRahavardAsset(json)).toEqual({ rial: 12140, asOf: new Date("2026-09-23T08:59:59Z") });
    expect(parseRahavardAsset({ data: { last_trade: { close_price: 0, real_close_price: 900 } } })?.rial).toBe(900);
    expect(parseRahavardAsset({ errors: [{ code: "invalid_params" }] })).toBeNull();
  });
});
