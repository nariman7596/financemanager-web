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
