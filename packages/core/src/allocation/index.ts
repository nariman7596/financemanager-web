/**
 * Where the household's money is, by what it is exposed to rather than by the
 * kind of instrument: a gold fund on the stock exchange moves with gold, and
 * USDT with the dollar. Assets only — debts are reported beside it, and what
 * is kept for others is not the household's.
 *
 * Pure: holdings and cash come in already valued in one currency.
 */

export const ASSET_CLASSES = ["CASH", "GOLD", "USD", "CRYPTO", "STOCK", "OTHER"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export function isAssetClass(v: unknown): v is AssetClass {
  return typeof v === "string" && (ASSET_CLASSES as readonly string[]).includes(v);
}

const DOLLAR_COINS = new Set(["USDT", "USDC", "DAI", "BUSD", "TUSD", "FDUSD"]);
const GOLD_COINS = new Set(["PAXG", "XAUT"]);

/**
 * A holding's class: the owner's choice if set, else by type — gold and
 * coins, dollar-pegged coins and cash dollars, commodity funds (the exchange's
 * "صندوق … کالا" funds hold gold certificates) as gold, other funds and shares
 * as stocks.
 */
export function classOf(h: { type: string; symbol: string; name: string; allocClass?: string | null }): AssetClass {
  if (isAssetClass(h.allocClass)) return h.allocClass;
  const symbol = h.symbol.toUpperCase();
  switch (h.type) {
    case "GOLD":
      return "GOLD";
    case "FX":
      return "USD";
    case "CRYPTO":
      if (DOLLAR_COINS.has(symbol)) return "USD";
      if (GOLD_COINS.has(symbol)) return "GOLD";
      return "CRYPTO";
    case "ETF":
      return /کالا|طلا/.test(h.name) ? "GOLD" : "STOCK";
    case "STOCK":
      return "STOCK";
    case "CASH":
      return "CASH";
    default:
      return "OTHER";
  }
}

export interface AllocationRow {
  cls: AssetClass;
  value: number;
  /** 0..1 of all assets. */
  share: number;
  /** 0..1, when a target was set. */
  target: number | null;
  /** Value to add (+) or take out (−) to meet the target; null without one. */
  toTarget: number | null;
}

/**
 * Totals per class (negative or zero values dropped — an overdrawn account is
 * a debt, not a negative asset), each class's share, and against optional
 * targets (percentages), how much would move it onto target.
 */
export function allocate(
  items: { cls: AssetClass; value: number }[],
  targets: Partial<Record<AssetClass, number>> = {},
): { total: number; rows: AllocationRow[] } {
  const sums = new Map<AssetClass, number>();
  for (const it of items) {
    if (!(it.value > 0)) continue;
    sums.set(it.cls, (sums.get(it.cls) ?? 0) + it.value);
  }
  const total = [...sums.values()].reduce((s, v) => s + v, 0);
  const rows: AllocationRow[] = [];
  for (const cls of ASSET_CLASSES) {
    const value = sums.get(cls) ?? 0;
    const pct = targets[cls];
    const target = typeof pct === "number" && pct > 0 ? pct / 100 : null;
    if (value <= 0 && target === null) continue;
    rows.push({
      cls,
      value,
      share: total > 0 ? value / total : 0,
      target,
      toTarget: target === null ? null : target * total - value,
    });
  }
  rows.sort((a, b) => b.value - a.value);
  return { total, rows };
}

/** Targets as saved (percent per class): kept only if they are numbers 0–100 summing to 100 (±0.5). */
export function parseTargets(json: unknown): Partial<Record<AssetClass, number>> | null {
  if (!json || typeof json !== "object") return null;
  const out: Partial<Record<AssetClass, number>> = {};
  let sum = 0;
  for (const cls of ASSET_CLASSES) {
    const v = (json as Record<string, unknown>)[cls];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    if (n > 0) out[cls] = n;
    sum += n;
  }
  return Math.abs(sum - 100) <= 0.5 ? out : null;
}
