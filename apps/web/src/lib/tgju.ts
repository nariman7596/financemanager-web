import "server-only";
import { prisma } from "./prisma";
import { parseTgju, tgjuItem, tomanIn, TGJU_ITEMS } from "@financemanager/core/market";

// ---------------------------------------------------------------------------
// Gold, coins and foreign cash priced from tgju.org (see core/market). One
// request covers every item; checked from the production server, where the
// stock exchange's own sites do not answer. URL overridable.
// ---------------------------------------------------------------------------

const TGJU_URL = process.env.TGJU_API_URL ?? "https://call1.tgju.org/ajax.json";

/** Always quoted, held or not: the free-market dollar and the Emami coin everyone watches. */
const ALWAYS = ["price_dollar_rl", "sekee"];

export type TgjuRefreshSummary = { updated: number; error?: string };

/**
 * Store today's tgju price of every item held (plus the dollar and the coin)
 * and reprice the holdings that follow one. A failure leaves the last prices
 * as they were.
 */
export async function refreshTgjuPrices(householdId?: string): Promise<TgjuRefreshSummary> {
  const holdings = await prisma.investment.findMany({
    where: { ...(householdId ? { householdId } : {}), priceSource: { startsWith: "tgju:" } },
    select: { id: true, priceSource: true, currency: true },
  });
  let json: unknown;
  try {
    const res = await fetch(TGJU_URL, {
      cache: "no-store",
      // tgju answers a browser; a bare client gets nothing useful.
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`tgju ${res.status}`);
    json = await res.json();
  } catch (e) {
    return { updated: 0, error: e instanceof Error ? e.message : "tgju failed" };
  }

  const now = new Date();
  const keys = new Set<string>(ALWAYS);
  for (const h of holdings) {
    const key = tgjuItem(h.priceSource)?.key;
    if (key) keys.add(key);
  }
  const prices = new Map<string, number>();
  for (const key of keys) {
    const p = parseTgju(json, key, now);
    const item = TGJU_ITEMS.find((i) => i.key === key);
    if (!p || !item) continue;
    prices.set(key, p.toman);
    await prisma.marketQuote.upsert({
      where: { symbol_source: { symbol: item.symbol, source: "tgju" } },
      create: { symbol: item.symbol, source: "tgju", price: p.toman, asOf: now },
      update: { price: p.toman, asOf: now },
    });
  }

  let updated = 0;
  for (const h of holdings) {
    const key = tgjuItem(h.priceSource)?.key;
    const toman = key ? prices.get(key) : undefined;
    const price = toman === undefined ? null : tomanIn(h.currency, toman);
    if (price === null) continue;
    await prisma.investment.update({ where: { id: h.id }, data: { currentPrice: price } });
    updated++;
  }
  return { updated };
}
