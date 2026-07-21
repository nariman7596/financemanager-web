import { prisma } from "./prisma";
import { toNumber } from "./utils";

// Multi-currency conversion.
// Rates are stored in the ExchangeRate table as "quote per 1 base".
// A real deployment can refresh these from an FX API on a schedule; the
// seed script inserts a starter set so the app works offline out of the box.

/** In-memory rate map: `${base}->${quote}` => rate. */
type RateMap = Map<string, number>;

async function loadRates(): Promise<RateMap> {
  const rows = await prisma.exchangeRate.findMany();
  const map: RateMap = new Map();
  for (const r of rows) {
    map.set(`${r.base}->${r.quote}`, toNumber(r.rate));
  }
  return map;
}

/**
 * Convert `amount` from `from` currency into `to` currency.
 * Falls back to 1:1 if no rate is known (and logs a warning server-side).
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: RateMap,
): number {
  if (from === to) return amount;

  const direct = rates.get(`${from}->${to}`);
  if (direct != null) return amount * direct;

  const inverse = rates.get(`${to}->${from}`);
  if (inverse != null && inverse !== 0) return amount / inverse;

  // Triangulate through USD if possible.
  const fromUsd = rates.get(`${from}->USD`) ?? invRate(rates, `USD->${from}`);
  const toUsd = rates.get(`USD->${to}`) ?? invRate(rates, `${to}->USD`);
  if (fromUsd != null && toUsd != null) return amount * fromUsd * toUsd;

  if (process.env.NODE_ENV === "development") {
    console.warn(`[currency] no rate for ${from}->${to}; using 1:1`);
  }
  return amount;
}

function invRate(rates: RateMap, key: string): number | undefined {
  const v = rates.get(key);
  return v != null && v !== 0 ? 1 / v : undefined;
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
