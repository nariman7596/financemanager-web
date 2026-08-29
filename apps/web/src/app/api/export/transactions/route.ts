import type { NextRequest } from "next/server";
import { parseISO, isValid, startOfDay, endOfDay } from "date-fns";
import { getActiveContext } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@financemanager/core/csv";
import { toNumber } from "@financemanager/core/money";

// GET /api/export/transactions -> downloads the active household's transactions
// as CSV. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD filters by date (used by the
// Reports page). Columns round-trip with the importer.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getActiveContext();
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Optional date-range filter.
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ? parseISO(fromParam) : null;
  const to = toParam ? parseISO(toParam) : null;
  const dateFilter =
    from && isValid(from) && to && isValid(to)
      ? { date: { gte: startOfDay(from), lte: endOfDay(to) } }
      : {};

  const txns = await prisma.transaction.findMany({
    where: { householdId: ctx.householdId, ...dateFilter },
    include: { account: true, category: true, transferAccount: true },
    orderBy: { date: "desc" },
  });

  const header = [
    "date",
    "type",
    "amount",
    "currency",
    "account",
    "category",
    "transferAccount",
    "description",
  ];
  const rows = txns.map((t) => [
    t.date.toISOString().slice(0, 10),
    t.type,
    toNumber(t.amount),
    t.currency,
    t.account.name,
    t.category?.name ?? "",
    t.transferAccount?.name ?? "",
    t.description ?? "",
  ]);

  const csv = toCsv(header, rows);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
