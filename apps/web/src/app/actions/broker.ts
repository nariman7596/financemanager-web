"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { getBaseCurrency } from "@/lib/queries";
import { readXlsx } from "@/lib/xlsx";
import { parseBrokerPortfolio, parseSharedStrings, parseSheetXml } from "@financemanager/core/market";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Replace the imported stock portfolio with a new broker export: every
 * symbol in the file is added or brought up to date (quantity, cost with
 * fees, closing price), and a symbol no longer in it — sold — is removed.
 * Holdings entered by hand are not touched; imported ones are recognised by
 * `priceSource = "tse:<symbol>"`.
 */
export async function importBrokerPortfolio(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the exported file" };
  if (file.size > MAX_BYTES) return { error: "File too large" };

  const xlsx = readXlsx(Buffer.from(await file.arrayBuffer()));
  const rows = xlsx ? parseSheetXml(xlsx.sheet, xlsx.shared ? parseSharedStrings(xlsx.shared) : []) : null;
  const holdings = rows ? parseBrokerPortfolio(rows) : null;
  if (!holdings) return { error: "not-a-portfolio" };

  // Prices in the file are rial; kept in the household's toman or rial.
  const base = await getBaseCurrency(ctx.householdId);
  const currency = base === "IRR" ? "IRR" : "IRT";
  const fromRial = (rial: number) => (currency === "IRR" ? rial : rial / 10);

  const existing = await prisma.investment.findMany({
    where: { householdId: ctx.householdId, priceSource: { startsWith: "tse:" } },
    select: { id: true, priceSource: true },
  });
  const bySource = new Map(existing.map((e) => [e.priceSource!, e.id]));
  let added = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const h of holdings) {
    const priceSource = `tse:${h.symbol}`;
    seen.add(priceSource);
    const data = {
      symbol: h.symbol.slice(0, 20),
      name: h.name.slice(0, 100),
      type: h.isFund ? "ETF" : "STOCK",
      quantity: h.quantity,
      costBasis: fromRial(h.quantity * h.avgCostRial),
      currentPrice: fromRial(h.priceRial),
      currency,
    };
    const id = bySource.get(priceSource);
    if (id) {
      await prisma.investment.update({ where: { id }, data });
      updated++;
    } else {
      await prisma.investment.create({ data: { ...data, priceSource, householdId: ctx.householdId, createdById: ctx.userId } });
      added++;
    }
  }
  const gone = existing.filter((e) => !seen.has(e.priceSource!)).map((e) => e.id);
  if (gone.length) await prisma.investment.deleteMany({ where: { id: { in: gone } } });

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  revalidatePath("/goals");
  return { ok: true, added, updated, removed: gone.length };
}
