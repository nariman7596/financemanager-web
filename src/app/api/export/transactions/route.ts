import { getActiveContext } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { toNumber } from "@/lib/utils";

// GET /api/export/transactions -> downloads the active household's transactions
// as CSV. Columns round-trip with the importer.

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getActiveContext();
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const txns = await prisma.transaction.findMany({
    where: { householdId: ctx.householdId },
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
