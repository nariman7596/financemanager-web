import { describe, it, expect } from "vitest";
import { buildReportCsv, type ReportData } from "./index";
import { parseCsv } from "../csv";

const data: ReportData = {
  label: "Last 6 months",
  fromStr: "2026-03-01",
  toStr: "2026-08-31",
  base: "USD",
  flow: { income: 5000, expense: 3200.5, net: 1799.5 },
  categories: [{ name: "Groceries", value: 1200 }, { name: "Rent", value: 2000.5 }],
  members: [{ name: "Demo", spent: 2000, earned: 3000 }],
  includeMembers: true,
};

describe("buildReportCsv", () => {
  it("emits valid CSV that round-trips through the parser", () => {
    expect(() => parseCsv(buildReportCsv(data))).not.toThrow();
  });

  it("carries the range, base currency and totals", () => {
    const out = buildReportCsv(data);
    expect(out).toContain("2026-03-01");
    expect(out).toContain("USD");
    expect(out).toContain("3200.50");
  });

  it("formats money to two decimals", () => {
    // Avoids 1799.5000000001 reaching a spreadsheet.
    expect(buildReportCsv(data)).toContain("1799.50");
  });

  it("omits the member section when the household has one member", () => {
    const solo = buildReportCsv({ ...data, includeMembers: false });
    expect(solo).not.toContain("Demo");
    expect(buildReportCsv(data)).toContain("Demo");
  });

  it("quotes a category name containing a comma", () => {
    const out = buildReportCsv({
      ...data, categories: [{ name: "Food, dining", value: 10 }],
    });
    const rows = parseCsv(out);
    expect(rows.some((r) => r.includes("Food, dining"))).toBe(true);
  });
});
