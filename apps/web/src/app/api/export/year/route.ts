import type { NextRequest } from "next/server";
import { getActiveContext } from "@/lib/household";
import { getBaseCurrency } from "@/lib/queries";
import { defaultReportYear, getYearReport } from "@/lib/yearReport";
import { buildYearCsv } from "@financemanager/core/reports";
import { monthNameIn } from "@financemanager/core/calendar";
import { getT, getLocale } from "@/lib/i18n/server";

// GET /api/export/year?y=<year> -> the year in review as CSV (summary, months,
// categories, holdings) for the active household, in its base currency.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getActiveContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const locale = await getLocale();
  const t = await getT();
  const y = req.nextUrl.searchParams.get("y") ?? "";
  const year = /^\d{4}$/.test(y) ? Number(y) : defaultReportYear(locale);
  const base = await getBaseCurrency(ctx.householdId);
  const r = await getYearReport(ctx.householdId, base, locale, year);

  const csv = buildYearCsv({
    year,
    base,
    labels: {
      summary: t("year.csvSummary"),
      income: t("reports.income"),
      expenses: t("reports.expenses"),
      net: t("reports.net"),
      savingsRate: t("year.savingsRate"),
      worthStart: t("year.csvWorthStart"),
      worthEnd: t("year.csvWorthEnd"),
      realized: t("year.realized"),
      months: t("year.byMonth"),
      month: t("year.colMonth"),
      categories: t("summary.byCategory"),
      category: t("summary.colCategory"),
      amount: t("year.csvAmount"),
      share: t("year.csvShare"),
      holdings: t("year.holdings"),
      holding: t("inv.colSymbol"),
      value: t("inv.colValue"),
      cost: t("inv.totalCost"),
      gain: t("inv.colGain"),
    },
    flow: r.flow,
    worth: r.worth,
    realized: r.realized.gain,
    months: r.months.map((flow, i) => ({ label: monthNameIn(r.windows[i].start, locale), flow })),
    categories: r.categories.map((c) => ({ name: c.name === "Uncategorized" ? t("txnForm.uncategorized") : c.name, value: c.value })),
    holdings: r.holdings.map((h) => ({ name: h.symbol, value: h.value, cost: h.cost })),
  });

  // A byte-order mark so Excel opens the Persian text as UTF-8.
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="year-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
