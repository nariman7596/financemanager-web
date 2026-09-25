import { describe, expect, it } from "vitest";
import { parseBrokerPortfolio, parseSharedStrings, parseSheetXml } from "./broker";

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
