import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getMarketQuotes } from "./iranMarket";
import { fetchCryptoPrices } from "./marketdata";
import { toNumber } from "@financemanager/core/money";
import { tomanIn } from "@financemanager/core/market";
import {
  ADDRESS_KINDS,
  CHAINS,
  DUST_USD,
  addressKindOf,
  assetsOn,
  assetByKey,
  parseBlockcypher,
  parseEvm,
  parseEvmAddress,
  callWithAddress,
  TANGEM_YIELD_FACTORY,
  YIELD_MODULES_SELECTOR,
  parseNear,
  parseSolana,
  parseToncenter,
  parseTron,
  parseXrp,
  walletCostBasis,
  type AddressKind,
  type Chain,
} from "@financemanager/core/wallets";

// ---------------------------------------------------------------------------
// Wallet balances read from public chain APIs (see core/wallets). Every
// endpoint below was checked from the production server; all are keyless and
// overridable by env. Where a chain has a second public endpoint it is tried
// when the first fails.
// ---------------------------------------------------------------------------

const env = (name: string, fallback: string) => process.env[name] || fallback;
const URLS = {
  ethereum: [env("WALLET_ETHEREUM_RPC", "https://ethereum-rpc.publicnode.com")],
  arbitrum: [env("WALLET_ARBITRUM_RPC", "https://arbitrum-one-rpc.publicnode.com")],
  tron: [env("WALLET_TRON_API", "https://api.trongrid.io")],
  ton: [env("WALLET_TON_API", "https://toncenter.com/api/v2")],
  solana: [env("WALLET_SOLANA_RPC", "https://api.mainnet-beta.solana.com")],
  near: [env("WALLET_NEAR_RPC", "https://rpc.mainnet.near.org"), "https://free.rpc.fastnear.com"],
  xrp: [env("WALLET_XRP_RPC", "https://xrplcluster.com"), "https://s1.ripple.com:51234"],
  blockcypher: [env("WALLET_BLOCKCYPHER_API", "https://api.blockcypher.com/v1")],
};
const BLOCKCYPHER_COIN: Partial<Record<Chain, string>> = { bitcoin: "btc", litecoin: "ltc", dash: "dash" };

async function getJson(url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "FinanceManager/1.0" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  // Several of these APIs answer an error with a JSON body worth parsing
  // (NEAR's UNKNOWN_ACCOUNT, rippled's actNotFound), so the body is read first.
  const json = await res.json().catch(() => null);
  if (json === null) throw new Error(`HTTP ${res.status}`);
  return json;
}

/** The first endpoint that answers in a shape the parser accepts. */
async function firstOf<T>(urls: string[], ask: (url: string) => Promise<T | null>): Promise<T> {
  let last = "no answer";
  for (const url of urls) {
    try {
      const v = await ask(url);
      if (v !== null) return v;
      last = "unexpected response";
    } catch (e) {
      last = e instanceof Error ? e.message : "failed";
    }
  }
  throw new Error(last);
}

const rpc = (method: string, params: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });
/** ERC-20 `balanceOf(address)`. */
const BALANCE_OF = "0x70a08231";

/** Every asset's balance on one chain at one address, by asset key. Throws when the chain cannot be read. */
async function readChain(chain: Chain, address: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const assets = assetsOn(chain);
  switch (chain) {
    case "ethereum":
    case "arbitrum": {
      const call = (to: string, data: string) => rpc("eth_call", [{ to, data }, "latest"]);
      // Tokens in Tangem's yield mode sit at the owner's yield module, if one was deployed.
      let yieldModule: string | null = null;
      if (assets.some((a) => a.holder === "tangemYield")) {
        yieldModule = await firstOf(URLS[chain], async (u) => {
          const r = parseEvmAddress(await getJson(u, call(TANGEM_YIELD_FACTORY, callWithAddress(YIELD_MODULES_SELECTOR, address))));
          return r === undefined ? null : { found: r };
        }).then((r) => r.found);
      }
      for (const a of assets) {
        const holder = a.holder === "tangemYield" ? yieldModule : address;
        if (!holder) {
          out.set(a.key, 0);
          continue;
        }
        const body = a.contract ? call(a.contract, callWithAddress(BALANCE_OF, holder)) : rpc("eth_getBalance", [holder, "latest"]);
        out.set(a.key, await firstOf(URLS[chain], async (u) => parseEvm(await getJson(u, body), a.decimals)));
      }
      break;
    }
    case "tron": {
      const json = await firstOf(URLS.tron, (u) => getJson(`${u}/v1/accounts/${address}`));
      for (const a of assets) {
        const v = parseTron(json, a);
        if (v === null) throw new Error("unexpected response");
        out.set(a.key, v);
      }
      break;
    }
    case "ton":
      out.set("ton:TON", await firstOf(URLS.ton, async (u) => parseToncenter(await getJson(`${u}/getAddressBalance?address=${encodeURIComponent(address)}`))));
      break;
    case "solana":
      out.set("solana:SOL", await firstOf(URLS.solana, async (u) => parseSolana(await getJson(u, rpc("getBalance", [address])))));
      break;
    case "near":
      out.set(
        "near:NEAR",
        await firstOf(URLS.near, async (u) =>
          parseNear(await getJson(u, rpc("query", { request_type: "view_account", finality: "final", account_id: address }))),
        ),
      );
      break;
    case "xrp":
      out.set(
        "xrp:XRP",
        await firstOf(URLS.xrp, async (u) =>
          parseXrp(await getJson(u, { method: "account_info", params: [{ account: address, ledger_index: "validated" }] })),
        ),
      );
      break;
    case "bitcoin":
    case "litecoin":
    case "dash": {
      const coin = BLOCKCYPHER_COIN[chain]!;
      const key = assets[0].key;
      out.set(key, await firstOf(URLS.blockcypher, async (u) => parseBlockcypher(await getJson(`${u}/${coin}/main/addrs/${address}/balance`))));
      break;
    }
  }
  return out;
}

export function walletAddresses(json: unknown): Partial<Record<AddressKind, string>> {
  const out: Partial<Record<AddressKind, string>> = {};
  if (!json || typeof json !== "object") return out;
  for (const k of ADDRESS_KINDS) {
    const v = (json as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export type WalletSyncSummary = { wallets: number; holdings: number; errors: string[] };

/**
 * Read every wallet (of one household, or all) and bring its holdings in
 * line: quantity from the chain, price in the holding's currency, cost basis
 * per `walletCostBasis`. A chain that cannot be read is recorded on the wallet
 * and its holdings stay as they were — an outage never zeroes a balance.
 *
 * Currency: in a toman/rial household a new holding is priced in toman, the
 * way the owner values coins — the Iranian exchanges' price for the coin when
 * they list it, else its dollar price at the exchanges' USDT rate (the
 * official dollar rate is far below the market). Otherwise in dollars.
 */
export async function syncWallets(householdId?: string, walletId?: string): Promise<WalletSyncSummary> {
  const wallets = await prisma.wallet.findMany({
    where: { ...(householdId ? { householdId } : {}), ...(walletId ? { id: walletId } : {}) },
    include: {
      household: { select: { baseCurrency: true } },
      holdings: { select: { id: true, walletAsset: true, quantity: true, costBasis: true, currency: true, currentPrice: true } },
    },
  });
  if (wallets.length === 0) return { wallets: 0, holdings: 0, errors: [] };

  // 1. Balances, chain by chain.
  const balances = new Map<string, Map<string, number>>();
  const failed = new Map<string, Record<string, string>>();
  await Promise.all(
    wallets.map(async (w) => {
      const addrs = walletAddresses(w.addresses);
      const found = new Map<string, number>();
      const errors: Record<string, string> = {};
      for (const chain of CHAINS) {
        const address = addrs[addressKindOf(chain)];
        if (!address) continue;
        try {
          for (const [k, v] of await readChain(chain, address)) found.set(k, v);
        } catch (e) {
          errors[chain] = e instanceof Error ? e.message : "failed";
        }
      }
      balances.set(w.id, found);
      failed.set(w.id, errors);
    }),
  );

  // 2. Prices: dollars from CoinGecko, toman from the exchanges' stored quotes.
  const ids = new Set<string>();
  for (const found of balances.values()) for (const [k, q] of found) if (q > 0) ids.add(assetByKey(k)!.coingecko);
  const usd = await fetchCryptoPrices([...ids]).catch(() => ({}) as Record<string, number>);
  const quotes = await getMarketQuotes();
  const usdtToman = quotes.get("USDT")?.consensus?.price ?? null;

  const priceIn = (currency: string, key: string): number | null => {
    const a = assetByKey(key)!;
    const dollars = usd[a.coingecko] ?? null;
    if (currency === "USD") return dollars;
    const listed = quotes.get(a.symbol)?.consensus?.price ?? null;
    const toman = listed ?? (dollars !== null && usdtToman !== null ? dollars * usdtToman : null);
    const price = toman === null ? null : tomanIn(currency, toman);
    // Fractions of a toman mean nothing on a coin worth hundreds of them.
    return price !== null && price >= 100 ? Math.round(price) : price;
  };

  // 3. Holdings.
  let holdings = 0;
  const allErrors: string[] = [];
  for (const w of wallets) {
    const found = balances.get(w.id)!;
    const errors = failed.get(w.id)!;
    for (const [chain, msg] of Object.entries(errors)) allErrors.push(`${w.name} ${chain}: ${msg}`);
    const base = w.household.baseCurrency;
    const newCurrency = (base === "IRT" || base === "IRR") && usdtToman !== null ? base : "USD";

    for (const [key, raw] of found) {
      const a = assetByKey(key)!;
      const existing = w.holdings.find((h) => h.walletAsset === key);
      const dollars = usd[a.coingecko];
      const qty = dollars !== undefined && raw * dollars < DUST_USD ? 0 : raw;
      if (qty <= 0) {
        if (existing) await prisma.investment.delete({ where: { id: existing.id } });
        continue;
      }
      const currency = existing?.currency ?? newCurrency;
      const price = priceIn(currency, key) ?? (existing ? toNumber(existing.currentPrice) : 0);
      // A holding created before any price was known has no real cost yet.
      const prev = existing && toNumber(existing.costBasis) > 0
        ? { quantity: toNumber(existing.quantity), costBasis: toNumber(existing.costBasis) }
        : null;
      const costBasis = price > 0 ? walletCostBasis(prev, qty, price) : prev?.costBasis ?? 0;
      if (existing) {
        await prisma.investment.update({ where: { id: existing.id }, data: { quantity: qty, currentPrice: price, costBasis } });
      } else {
        await prisma.investment.create({
          data: {
            householdId: w.householdId,
            createdById: w.createdById,
            walletId: w.id,
            walletAsset: key,
            symbol: a.symbol,
            name: a.name,
            type: "CRYPTO",
            quantity: qty,
            costBasis,
            currentPrice: price,
            currency,
          },
        });
      }
      holdings++;
    }
    await prisma.wallet.update({
      where: { id: w.id },
      data: { syncedAt: new Date(), errors: Object.keys(errors).length ? errors : Prisma.DbNull },
    });
  }
  return { wallets: wallets.length, holdings, errors: allErrors };
}
