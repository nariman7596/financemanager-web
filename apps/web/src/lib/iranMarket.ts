import "server-only";
import { prisma } from "./prisma";
import { toNumber } from "@financemanager/core/money";
import {
  consensusPrice,
  parseNobitex,
  parseTabdeal,
  parseWallex,
  tomanIn,
  type IranExchange,
  type Quote,
} from "@financemanager/core/market";

// ---------------------------------------------------------------------------
// Coin prices in toman from Iranian exchanges (see core/market for why).
// Holdings of type CRYPTO priced in IRT or IRR take their price from here;
// USD-priced ones keep CoinGecko (marketdata.ts). URLs are overridable.
// ---------------------------------------------------------------------------

// Nobitex's api. host does not answer from the (German) server; apiv2. does.
const NOBITEX_URL = process.env.NOBITEX_API_URL ?? "https://apiv2.nobitex.ir/market/stats";
const WALLEX_URL = process.env.WALLEX_API_URL ?? "https://api.wallex.ir/v1/markets";
// Tabdeal has no ticker endpoint; its last trade is the equivalent of the
// others' last price.
const TABDEAL_URL = process.env.TABDEAL_API_URL ?? "https://api1.tabdeal.org/r/api/v1/trades";

/** Coins quoted even without a holding: the dollar rate everyone checks. */
const ALWAYS = ["USDT"];

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "FinanceManager/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

type SourceResult = { source: IranExchange; prices: Record<string, number>; error?: string };

async function fromNobitex(symbols: string[]): Promise<SourceResult> {
  const json = await getJson(`${NOBITEX_URL}?srcCurrency=${symbols.map((s) => s.toLowerCase()).join(",")}&dstCurrency=rls`);
  return { source: "nobitex", prices: pick(symbols, (s) => parseNobitex(json, s)) };
}

async function fromWallex(symbols: string[]): Promise<SourceResult> {
  const json = await getJson(WALLEX_URL);
  return { source: "wallex", prices: pick(symbols, (s) => parseWallex(json, s)) };
}

async function fromTabdeal(symbols: string[]): Promise<SourceResult> {
  const prices: Record<string, number> = {};
  for (const s of symbols) {
    const p = parseTabdeal(await getJson(`${TABDEAL_URL}?symbol=${s.toUpperCase()}IRT&limit=1`), s);
    if (p !== null) prices[s] = p;
  }
  return { source: "tabdeal", prices };
}

function pick(symbols: string[], read: (s: string) => number | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of symbols) {
    const p = read(s);
    if (p !== null) out[s] = p;
  }
  return out;
}

export type IranRefreshSummary = { updated: number; sources: string[]; error?: string };

/**
 * Ask every exchange for every coin held in toman/rial (plus USDT), store
 * each quote, and price those holdings at the middle of the quotes. An
 * exchange that fails is reported and skipped; its last quote stays as it was.
 */
export async function refreshIranPrices(householdId?: string): Promise<IranRefreshSummary> {
  const holdings = await prisma.investment.findMany({
    where: { ...(householdId ? { householdId } : {}), type: "CRYPTO", currency: { in: ["IRT", "IRR"] } },
    select: { id: true, symbol: true, currency: true },
  });
  const symbols = [...new Set([...ALWAYS, ...holdings.map((h) => h.symbol.toUpperCase())])];

  const settled = await Promise.allSettled([fromWallex(symbols), fromNobitex(symbols), fromTabdeal(symbols)]);
  const names: IranExchange[] = ["wallex", "nobitex", "tabdeal"];
  const errors: string[] = [];
  const now = new Date();
  const ok: string[] = [];
  for (const [i, r] of settled.entries()) {
    if (r.status === "rejected") {
      errors.push(`${names[i]}: ${r.reason instanceof Error ? r.reason.message : "failed"}`);
      continue;
    }
    if (Object.keys(r.value.prices).length === 0) {
      errors.push(`${names[i]}: no price`);
      continue;
    }
    ok.push(names[i]);
    for (const [symbol, price] of Object.entries(r.value.prices)) {
      await prisma.marketQuote.upsert({
        where: { symbol_source: { symbol, source: names[i] } },
        create: { symbol, source: names[i], price, asOf: now },
        update: { price, asOf: now },
      });
    }
  }

  // Price from the quotes stored (fresh ones, and an exchange's last word if
  // it failed just now but answered within the day).
  const quotes = await getMarketQuotes(symbols);
  let updated = 0;
  for (const h of holdings) {
    const c = quotes.get(h.symbol.toUpperCase())?.consensus;
    const price = c ? tomanIn(h.currency, c.price) : null;
    if (price === null) continue;
    await prisma.investment.update({ where: { id: h.id }, data: { currentPrice: price } });
    updated++;
  }
  return { updated, sources: ok, ...(errors.length ? { error: errors.join(" · ") } : {}) };
}

const DAY = 24 * 60 * 60 * 1000;

export type SymbolQuotes = {
  quotes: (Quote & { asOf: Date })[];
  consensus: { price: number; used: string[] } | null;
};

/** Stored quotes per coin, with the price holdings are valued at. Quotes older than a day are shown but not used. */
export async function getMarketQuotes(symbols?: string[]): Promise<Map<string, SymbolQuotes>> {
  const rows = await prisma.marketQuote.findMany({
    where: symbols ? { symbol: { in: symbols } } : {},
    orderBy: [{ symbol: "asc" }, { source: "asc" }],
  });
  const out = new Map<string, SymbolQuotes>();
  const cutoff = Date.now() - DAY;
  for (const r of rows) {
    const entry = out.get(r.symbol) ?? { quotes: [], consensus: null };
    entry.quotes.push({ source: r.source, price: toNumber(r.price), asOf: r.asOf });
    out.set(r.symbol, entry);
  }
  for (const entry of out.values()) {
    entry.consensus = consensusPrice(entry.quotes.filter((q) => q.asOf.getTime() >= cutoff));
  }
  return out;
}
