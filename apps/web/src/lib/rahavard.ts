import "server-only";
import { prisma } from "./prisma";
import { parseRahavardAsset, parseRahavardSearch, tomanIn } from "@financemanager/core/market";

// ---------------------------------------------------------------------------
// Closing prices of stocks and funds imported from the broker (priceSource
// "tse:<symbol>"), from rahavard365 — the exchange's own TSETMC does not
// answer from the German server. Checked from it 2026-09-26. URL overridable.
// ---------------------------------------------------------------------------

const RAHAVARD_URL = process.env.RAHAVARD_API_URL ?? "https://rahavard365.com/api/v2";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** Symbol → rahavard asset id; ids do not change, so one lookup per process. */
const ids = new Map<string, string>();

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`rahavard ${res.status}`);
  return res.json();
}

// Gentle with a site that is not a public API.
const pause = () => new Promise((r) => setTimeout(r, 400));

export type TseRefreshSummary = { updated: number; error?: string };

/** Reprice every imported holding at its latest closing price. A symbol that fails keeps its price. */
export async function refreshTsePrices(householdId?: string): Promise<TseRefreshSummary> {
  const holdings = await prisma.investment.findMany({
    where: { ...(householdId ? { householdId } : {}), priceSource: { startsWith: "tse:" } },
    select: { id: true, priceSource: true, currency: true },
  });
  const symbols = [...new Set(holdings.map((h) => h.priceSource!.slice(4)))];
  const prices = new Map<string, number>();
  const failed: string[] = [];
  for (const symbol of symbols) {
    try {
      let id = ids.get(symbol);
      if (!id) {
        await pause();
        id = parseRahavardSearch(await getJson(`${RAHAVARD_URL}/search?keyword=${encodeURIComponent(symbol)}`), symbol) ?? undefined;
        if (!id) throw new Error("not found");
        ids.set(symbol, id);
      }
      await pause();
      const p = parseRahavardAsset(await getJson(`${RAHAVARD_URL}/asset/${id}`));
      if (!p) throw new Error("no price");
      prices.set(symbol, p.rial);
    } catch {
      failed.push(symbol);
    }
  }
  let updated = 0;
  for (const h of holdings) {
    const rial = prices.get(h.priceSource!.slice(4));
    const price = rial === undefined ? null : tomanIn(h.currency, rial / 10);
    if (price === null) continue;
    await prisma.investment.update({ where: { id: h.id }, data: { currentPrice: price } });
    updated++;
  }
  return { updated, ...(failed.length ? { error: `rahavard: ${failed.join("، ")}` } : {}) };
}
