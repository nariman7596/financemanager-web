// Multi-currency conversion — the pure half.
//
// Rates are supplied by the caller as a plain map, so this module has no
// database dependency and runs identically on a phone holding a locally cached
// rate table. Loading those rates is the app's job (apps/web/src/lib/currency.ts).

/** In-memory rate map: `${base}->${quote}` => rate. */
export type RateMap = Map<string, number>;

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

  // A missing rate silently falling back to 1:1 misreports money, so it is
  // worth surfacing. `process` does not exist in a browser or in Hermes, hence
  // the guarded lookup rather than a bare `process.env` — reaching for it
  // directly is what made this module fail to compile as a shared package.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  if (env?.NODE_ENV === "development") {
    console.warn(`[currency] no rate for ${from}->${to}; using 1:1`);
  }
  return amount;
}

function invRate(rates: RateMap, key: string): number | undefined {
  const v = rates.get(key);
  return v != null && v !== 0 ? 1 / v : undefined;
}
