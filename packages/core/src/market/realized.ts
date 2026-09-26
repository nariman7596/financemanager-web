/**
 * Realized gain: what a sale actually earned, as opposed to the paper gain
 * on what is still held. Pure + testable.
 *
 * Cost leaves a holding in proportion to the quantity sold (average cost —
 * the way the broker measures it too). The price is the one the sale was
 * made at when known; a sale seen only as a smaller quantity in the next
 * broker export is priced at that day's closing price and marked estimated,
 * for the owner to correct with what the broker paid.
 */

export interface Realized {
  quantity: number;
  cost: number;
  proceeds: number;
}

const EPS = 1e-9;

/** Selling `sold` units at `price` out of a holding of `quantity` bought for `cost`. */
export function realizedPart(held: { quantity: number; cost: number }, sold: number, price: number, currency?: string): Realized | null {
  if (!(held.quantity > 0) || !(sold > held.quantity * EPS) || !(price >= 0)) return null;
  const q = Math.min(sold, held.quantity);
  return {
    quantity: q,
    cost: roundIn(currency, (held.cost * q) / held.quantity),
    proceeds: roundIn(currency, q * price),
  };
}

/**
 * What a new broker export says was sold since the last one: the drop in
 * quantity (all of it when the symbol is gone), priced at the new closing
 * price or, for a symbol no longer listed, the last price known. A rise
 * (a purchase, bonus shares) realizes nothing.
 */
export function realizedOnReimport(
  before: { quantity: number; cost: number; price: number },
  after: { quantity: number; price: number } | null,
  currency?: string,
): Realized | null {
  const left = after?.quantity ?? 0;
  const sold = before.quantity - left;
  if (sold <= before.quantity * 1e-6) return null;
  const price = after && after.price > 0 ? after.price : before.price;
  return realizedPart(before, sold, price, currency);
}

/** Totals over the sales dated in [from, to]. */
export function realizedTotals(
  rows: { soldAt: Date; proceeds: number; cost: number }[],
  from: Date,
  to: Date,
): { proceeds: number; cost: number; gain: number; count: number } {
  let proceeds = 0;
  let cost = 0;
  let count = 0;
  for (const r of rows) {
    if (r.soldAt < from || r.soldAt > to) continue;
    proceeds += r.proceeds;
    cost += r.cost;
    count++;
  }
  return { proceeds, cost, gain: proceeds - cost, count };
}

// Toman and rial have no useful fractions.
function roundIn(currency: string | undefined, n: number): number {
  return currency === "IRT" || currency === "IRR" ? Math.round(n) : Math.round(n * 100) / 100;
}
