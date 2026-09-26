/**
 * Coin prices in toman from the Iranian exchanges the owner trades on.
 *
 * The official USD->IRR rate the FX feed returns is a fraction of what anyone
 * actually pays, so it cannot value a coin kept in Iran. Each exchange's
 * public market API is asked instead, and the holding is valued at the
 * middle of their quotes — one exchange with a stale or odd price does not
 * move it. Every quote is kept and shown, because the owner compares them
 * before trading.
 *
 * Pure: the parsers take the parsed JSON each API returns. Every field is read
 * defensively — a response that does not look as expected yields null for
 * that exchange, never a wrong number.
 */

export const IRAN_EXCHANGES = ["wallex", "nobitex", "tabdeal"] as const;
export type IranExchange = (typeof IRAN_EXCHANGES)[number];

const RIAL_PER_TOMAN = 10;

function positive(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function get(obj: unknown, ...path: string[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * Nobitex `GET /market/stats?srcCurrency=usdt,btc&dstCurrency=rls`:
 * `{ status: "ok", stats: { "usdt-rls": { latest: "1143480", bestBuy, bestSell } } }`.
 * Prices are in rial.
 */
export function parseNobitex(json: unknown, symbol: string): number | null {
  const s = get(json, "stats", `${symbol.toLowerCase()}-rls`);
  if (!s || get(s, "isClosed") === true) return null;
  const rial = positive(get(s, "latest")) ?? positive(get(s, "bestSell"));
  return rial === null ? null : rial / RIAL_PER_TOMAN;
}

/**
 * Wallex `GET /v1/markets`:
 * `{ result: { symbols: { USDTTMN: { stats: { lastPrice: "114350" } } } } }`.
 * Toman markets end in TMN.
 */
export function parseWallex(json: unknown, symbol: string): number | null {
  const stats = get(json, "result", "symbols", `${symbol.toUpperCase()}TMN`, "stats");
  return positive(get(stats, "lastPrice")) ?? positive(get(stats, "askPrice"));
}

/**
 * Tabdeal `GET /r/api/v1/trades?symbol=USDTIRT&limit=1` (Binance-style):
 * `[{ id, price: "233800.0000000000000000", qty, time }]` — the last trade.
 * A `{ symbol, price }` ticker shape is read too. IRT is toman.
 */
export function parseTabdeal(json: unknown, symbol: string): number | null {
  const want = `${symbol.toUpperCase()}IRT`;
  const rows = Array.isArray(json) ? json : [json];
  for (const r of rows) {
    const sym = get(r, "symbol");
    if (typeof sym === "string" && sym.toUpperCase().replace(/[_-]/g, "") !== want) continue;
    const p = positive(get(r, "price")) ?? positive(get(r, "lastPrice"));
    if (p !== null) return p;
  }
  return null;
}

export type Quote = { source: string; price: number };

/**
 * The price to value a holding at: the median of the exchanges' quotes. With
 * three or more, a quote more than a fifth away from the median of all is
 * left out first (a stale market, or a price in rial read as toman).
 * Null when no exchange answered.
 */
export function consensusPrice(quotes: Quote[]): { price: number; used: string[] } | null {
  const valid = quotes.filter((q) => Number.isFinite(q.price) && q.price > 0);
  if (valid.length === 0) return null;
  let used = valid;
  if (valid.length >= 3) {
    const mid = median(valid.map((q) => q.price));
    used = valid.filter((q) => Math.abs(q.price - mid) / mid <= 0.2);
    if (used.length === 0) used = valid;
  }
  return { price: median(used.map((q) => q.price)), used: used.map((q) => q.source) };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A toman price in the holding's own currency (toman or rial). */
export function tomanIn(currency: string, toman: number): number | null {
  if (currency === "IRT") return toman;
  if (currency === "IRR") return toman * RIAL_PER_TOMAN;
  return null;
}

// --- Gold, coins and foreign cash (tgju) -----------------------------------

/**
 * Physical gold, coins and banknotes kept at home have no exchange of their
 * own; the free-market prices Iranians quote come from tgju.org, whose
 * `ajax.json` answers from the production server (the stock exchange's own
 * sites do not). Each item is a tgju key, a symbol for the holding, and the
 * investment type it is filed under. Prices there are in rial per unit: one
 * coin, one gram, one mesghal, one banknote unit.
 */
export const TGJU_ITEMS = [
  { key: "sekee", symbol: "SEKEE", type: "GOLD" },
  { key: "sekeb", symbol: "SEKEB", type: "GOLD" },
  { key: "nim", symbol: "NIM", type: "GOLD" },
  { key: "rob", symbol: "ROB", type: "GOLD" },
  { key: "gerami", symbol: "GERAMI", type: "GOLD" },
  { key: "geram18", symbol: "GOLD18", type: "GOLD" },
  { key: "geram24", symbol: "GOLD24", type: "GOLD" },
  { key: "mesghal", symbol: "MESGHAL", type: "GOLD" },
  { key: "price_dollar_rl", symbol: "USD", type: "FX" },
  { key: "price_eur", symbol: "EUR", type: "FX" },
  { key: "price_aed", symbol: "AED", type: "FX" },
  { key: "price_gbp", symbol: "GBP", type: "FX" },
] as const;
export type TgjuItem = (typeof TGJU_ITEMS)[number];

/** A holding's price source, e.g. `tgju:sekee`. */
export function tgjuItem(priceSource: string | null | undefined): TgjuItem | undefined {
  if (!priceSource?.startsWith("tgju:")) return undefined;
  const key = priceSource.slice(5);
  return TGJU_ITEMS.find((i) => i.key === key);
}

/** How old a tgju price may be and still be used: markets close for Nowruz. */
export const TGJU_MAX_AGE_DAYS = 14;

/**
 * tgju `GET /ajax.json`: `{ current: { sekee: { p: "2,400,100,000", ts:
 * "2026-09-24 00:00:00" }, … } }` — rial, and a Tehran-time stamp. The file
 * carries hundreds of keys, some untouched for years, so a price older than
 * `TGJU_MAX_AGE_DAYS` is not used. Returns toman.
 */
export function parseTgju(json: unknown, key: string, now = new Date()): { toman: number; asOf: Date } | null {
  const item = get(json, "current", key);
  const rial = positive(get(item, "p"));
  if (rial === null) return null;
  const ts = get(item, "ts");
  const asOf = typeof ts === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? new Date(ts.replace(" ", "T") + "+03:30") : null;
  if (!asOf || Number.isNaN(asOf.getTime())) return null;
  if (now.getTime() - asOf.getTime() > TGJU_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
  return { toman: rial / RIAL_PER_TOMAN, asOf };
}

export { parseBrokerPortfolio, parseRahavardAsset, parseRahavardSearch, parseSheetXml, parseSharedStrings, type BrokerHolding } from "./broker";
export { realizedOnReimport, realizedPart, realizedTotals, type Realized } from "./realized";
