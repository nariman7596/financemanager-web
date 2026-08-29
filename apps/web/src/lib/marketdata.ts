import "server-only";
import { prisma } from "@financemanager/db";
import { CURRENCY_CODES } from "@financemanager/core/constants";
import { toNumber } from "@financemanager/core/money";

// ---------------------------------------------------------------------------
// Live market data: FX rates + investment prices.
//
// Fetch and store layers are deliberately separate so the store logic can be
// tested with injected payloads, and so providers can be swapped via env vars.
//
// Defaults use keyless public APIs:
//   - FX:     https://open.er-api.com/v6/latest/USD   (USD-based rates)
//   - Crypto: https://api.coingecko.com/api/v3/simple/price
//   - Stocks: optional — set STOCK_API_KEY (Finnhub) to enable
//
// NOTE: your deployment must be allowed to reach these hosts on the network.
// ---------------------------------------------------------------------------

const FX_BASE = "USD";
const FX_URL = process.env.FX_API_URL ?? `https://open.er-api.com/v6/latest/${FX_BASE}`;
const COINGECKO_URL =
  process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3/simple/price";
const FINNHUB_URL = "https://finnhub.io/api/v1/quote";

export type RefreshSummary = {
  fx: { updated: number; error?: string };
  prices: { updated: number; skipped: number; error?: string };
  at: string;
};

// --- FX -------------------------------------------------------------------

/** Fetch USD-based rates: { EUR: 0.92, GBP: 0.79, ... }. Throws on failure. */
export async function fetchFxRates(): Promise<Record<string, number>> {
  const res = await fetch(FX_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`FX API returned ${res.status}`);
  const data = await res.json();
  const rates = data?.rates ?? data?.conversion_rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("FX API response missing rates");
  }
  return rates as Record<string, number>;
}

/** Rial per toman. A definition, not an estimate: 1 toman = 10 rial. */
const RIAL_PER_TOMAN = 10;

/**
 * Fill in rates the upstream feed cannot provide.
 *
 * Toman has no ISO 4217 code, so no FX API quotes it — but it is exactly one
 * tenth of a rial by definition, so USD->IRT is USD->IRR divided by ten. This
 * is arithmetic on an official rate, not a guess; if IRR itself is missing we
 * leave IRT missing too rather than inventing one.
 */
function withDerivedRates(rates: Record<string, number>): Record<string, number> {
  const irr = rates.IRR;
  if (typeof irr !== "number" || !Number.isFinite(irr) || irr <= 0) return rates;
  return { ...rates, IRT: irr / RIAL_PER_TOMAN };
}

/**
 * Store USD-based rates as ExchangeRate rows (base=USD, quote=X) for every
 * currency the app supports. Storing USD->X for all X is enough: currency.ts
 * triangulates any pair through USD. Returns how many rows were written.
 */
export async function storeFxRates(
  input: Record<string, number>,
  now: Date,
): Promise<number> {
  const rates = withDerivedRates(input);
  let updated = 0;
  for (const quote of CURRENCY_CODES) {
    if (quote === FX_BASE) continue;
    const rate = rates[quote];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: FX_BASE, quote } },
      create: { base: FX_BASE, quote, rate, asOf: now },
      update: { rate, asOf: now },
    });
    updated++;
  }
  return updated;
}

export async function refreshFxRates(now: Date): Promise<RefreshSummary["fx"]> {
  try {
    const rates = await fetchFxRates();
    const updated = await storeFxRates(rates, now);
    return { updated };
  } catch (e) {
    return { updated: 0, error: e instanceof Error ? e.message : "FX refresh failed" };
  }
}

// --- Investment prices ----------------------------------------------------

// Minimal symbol -> CoinGecko id map for common holdings. Extend as needed.
const CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  LTC: "litecoin",
  BNB: "binancecoin",
  USDT: "tether",
  USDC: "usd-coin",
};

/** Fetch crypto prices (in USD) keyed by CoinGecko id. Throws on failure. */
export async function fetchCryptoPrices(
  ids: string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const url = `${COINGECKO_URL}?ids=${ids.join(",")}&vs_currencies=usd`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  const data = (await res.json()) as Record<string, { usd?: number }>;
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(data)) {
    if (typeof v?.usd === "number") out[id] = v.usd;
  }
  return out;
}

/** Fetch a single stock quote via Finnhub. Returns null if unavailable. */
export async function fetchStockQuote(symbol: string): Promise<number | null> {
  const key = process.env.STOCK_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${FINNHUB_URL}?symbol=${symbol}&token=${key}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { c?: number };
    return typeof data?.c === "number" && data.c > 0 ? data.c : null;
  } catch {
    return null;
  }
}

/**
 * Refresh currentPrice for investments. Pass a householdId to scope to one
 * household, or omit to refresh every household's holdings (scheduled job).
 * Only USD-priced holdings are auto-updated (the public APIs quote in USD).
 */
export async function refreshInvestmentPrices(
  householdId?: string,
): Promise<RefreshSummary["prices"]> {
  try {
    const holdings = await prisma.investment.findMany({
      where: { ...(householdId ? { householdId } : {}), currency: "USD" },
      select: { id: true, symbol: true, type: true },
    });
    if (holdings.length === 0) return { updated: 0, skipped: 0 };

    // Crypto: batch-fetch by CoinGecko id.
    const cryptoHoldings = holdings.filter(
      (h) => h.type === "CRYPTO" && CRYPTO_IDS[h.symbol.toUpperCase()],
    );
    const ids = Array.from(
      new Set(cryptoHoldings.map((h) => CRYPTO_IDS[h.symbol.toUpperCase()])),
    );
    const cryptoPrices = ids.length ? await fetchCryptoPrices(ids) : {};

    let updated = 0;
    let skipped = 0;
    for (const h of holdings) {
      let price: number | null = null;
      const sym = h.symbol.toUpperCase();
      if (h.type === "CRYPTO" && CRYPTO_IDS[sym]) {
        price = cryptoPrices[CRYPTO_IDS[sym]] ?? null;
      } else if (h.type === "STOCK" || h.type === "ETF") {
        price = await fetchStockQuote(sym);
      }
      if (price != null && Number.isFinite(price) && price > 0) {
        await prisma.investment.update({
          where: { id: h.id },
          data: { currentPrice: price },
        });
        updated++;
      } else {
        skipped++;
      }
    }
    return { updated, skipped };
  } catch (e) {
    return {
      updated: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : "Price refresh failed",
    };
  }
}

/** Full refresh: FX + prices. `householdId` scopes the price refresh. */
export async function refreshAll(householdId?: string): Promise<RefreshSummary> {
  const now = new Date();
  const [fx, prices] = await Promise.all([
    refreshFxRates(now),
    refreshInvestmentPrices(householdId),
  ]);
  return { fx, prices, at: now.toISOString() };
}

/** Timestamp of the most recently updated FX rate, or null if none. */
export async function getFxAsOf(): Promise<Date | null> {
  const row = await prisma.exchangeRate.findFirst({
    orderBy: { asOf: "desc" },
    select: { asOf: true },
  });
  return row?.asOf ?? null;
}

export { toNumber };
