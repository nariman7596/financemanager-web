import { serializeCsv } from "./csv";

// Build a human-readable, multi-section report CSV for a date range. Pure +
// testable; the /api/export/report route feeds it the range aggregates.

export interface ReportData {
  label: string;
  fromStr: string;
  toStr: string;
  base: string;
  flow: { income: number; expense: number; net: number };
  categories: { name: string; value: number }[];
  members: { name: string; spent: number; earned: number }[];
  includeMembers: boolean;
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function buildReportCsv(d: ReportData): string {
  const totalExpense = d.categories.reduce((s, c) => s + c.value, 0);
  const rows: (string | number)[][] = [];

  rows.push(["FinanceManager report"]);
  rows.push(["Range", `${d.label} (${d.fromStr} to ${d.toStr})`]);
  rows.push(["Base currency", d.base]);
  rows.push([]);

  rows.push(["Summary"]);
  rows.push(["Income", money(d.flow.income)]);
  rows.push(["Expenses", money(d.flow.expense)]);
  rows.push(["Net", money(d.flow.net)]);
  rows.push([]);

  rows.push(["Spending by category"]);
  rows.push(["Category", "Amount", "Share %"]);
  for (const c of d.categories) {
    const share = totalExpense > 0 ? Math.round((c.value / totalExpense) * 100) : 0;
    rows.push([c.name, money(c.value), share]);
  }
  rows.push(["Total", money(totalExpense), ""]);

  if (d.includeMembers) {
    rows.push([]);
    rows.push(["Spending by member"]);
    rows.push(["Member", "Spent", "Earned"]);
    for (const m of d.members) {
      rows.push([m.name, money(m.spent), money(m.earned)]);
    }
  }

  return serializeCsv(rows);
}
