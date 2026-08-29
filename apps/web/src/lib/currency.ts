import { prisma } from "@financemanager/db";
import { toNumber } from "@financemanager/core/money";
import { convert, type RateMap } from "@financemanager/core/currency";

// Database-backed half of multi-currency support. The conversion maths lives in
// @financemanager/core/currency; this file only loads the ExchangeRate table.
//
// Rates are stored as "quote per 1 base". A real deployment refreshes these from
// an FX API on a schedule; the seed script inserts a starter set so the app
// works offline out of the box.

async function loadRates(): Promise<RateMap> {
  const rows = await prisma.exchangeRate.findMany();
  const map: RateMap = new Map();
  for (const r of rows) {
    map.set(`${r.base}->${r.quote}`, toNumber(r.rate));
  }
  return map;
}

/** Helper that converts a batch of {amount, currency} into a single target. */
export async function sumInCurrency(
  items: { amount: number; currency: string }[],
  target: string,
): Promise<number> {
  const rates = await loadRates();
  return items.reduce(
    (acc, it) => acc + convert(it.amount, it.currency, target, rates),
    0,
  );
}

export { loadRates };
