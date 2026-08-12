import type { NextRequest } from "next/server";
import { getActiveContext } from "@/lib/household";
import {
  getBaseCurrency,
  getFlowInRange,
  getCategoryBreakdown,
  getMemberBreakdown,
} from "@/lib/queries";
import { resolveRange } from "@/lib/dateRange";
import { buildReportCsv } from "@/lib/reportCsv";
import { getT } from "@/lib/i18n/server";

// GET /api/export/report?preset=|from=&to= -> a summary report CSV (totals +
// category + per-member breakdowns) for the active household over the range.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getActiveContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const params = req.nextUrl.searchParams;
  const range = resolveRange({
    preset: params.get("preset") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const t = await getT();
  const base = await getBaseCurrency(ctx.householdId);
  const [flow, categories, member] = await Promise.all([
    getFlowInRange(ctx.householdId, base, range.start, range.end),
    getCategoryBreakdown(ctx.householdId, base, range.start, range.end),
    getMemberBreakdown(ctx.householdId, base, range.start, range.end),
  ]);

  const csv = buildReportCsv({
    label: t(range.labelKey),
    fromStr: range.fromStr,
    toStr: range.toStr,
    base,
    flow,
    categories,
    members: member.rows,
    includeMembers: member.members > 1,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${range.fromStr}_to_${range.toStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
