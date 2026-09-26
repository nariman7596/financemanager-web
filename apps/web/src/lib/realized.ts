import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { realizedTotals } from "@financemanager/core/market";

/**
 * Every recorded sale, newest first, each also in the base currency so they
 * can be added up.
 */
export async function getRealized(householdId: string, base: string) {
  const [rates, rows] = await Promise.all([
    loadRates(),
    prisma.realizedGain.findMany({ where: { householdId }, orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }] }),
  ]);
  return rows.map((r) => {
    const proceeds = toNumber(r.proceeds);
    const cost = toNumber(r.cost);
    return {
      ...r,
      quantity: toNumber(r.quantity),
      proceeds,
      cost,
      gain: proceeds - cost,
      inBase: { proceeds: convert(proceeds, r.currency, base, rates), cost: convert(cost, r.currency, base, rates) },
    };
  });
}

export type RealizedRow = Awaited<ReturnType<typeof getRealized>>[number];

/** The realized gain over [from, to], in the base currency. */
export function realizedIn(rows: RealizedRow[], from: Date, to: Date) {
  return realizedTotals(
    rows.map((r) => ({ soldAt: r.soldAt, proceeds: r.inBase.proceeds, cost: r.inBase.cost })),
    from,
    to,
  );
}
