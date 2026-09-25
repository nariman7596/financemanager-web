/**
 * Self-custody wallets (a Tangem card, or any wallet) followed read-only.
 *
 * A wallet is only its public addresses — never a key, a seed phrase or an
 * access code — and every balance on a public chain can be read by anyone who
 * knows the address. The server asks each chain's public API what each
 * address holds and keeps the holdings on /investments in step.
 *
 * Pure: the catalogue of what is read on each chain, address checks, and the
 * parsers for each API's parsed JSON. A response that does not look as
 * expected gives null (the chain is reported as failed and its holdings are
 * left as they were), never a wrong balance.
 */

/** The chains an address is read on. */
export const CHAINS = [
  "bitcoin",
  "ethereum",
  "arbitrum",
  "tron",
  "ton",
  "solana",
  "near",
  "xrp",
  "litecoin",
  "dash",
] as const;
export type Chain = (typeof CHAINS)[number];

/**
 * The addresses a wallet is entered with. Ethereum and Arbitrum share one
 * address (every EVM chain does), so it is entered once.
 */
export const ADDRESS_KINDS = ["evm", "tron", "ton", "solana", "near", "xrp", "bitcoin", "litecoin", "dash"] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

export function addressKindOf(chain: Chain): AddressKind {
  return chain === "ethereum" || chain === "arbitrum" ? "evm" : chain;
}

export interface WalletAsset {
  /** Stable id of the holding it becomes: `chain:SYMBOL` (+ a variant). */
  key: string;
  chain: Chain;
  symbol: string;
  name: string;
  /** CoinGecko id, for the dollar price. */
  coingecko: string;
  decimals: number;
  /** Token contract (EVM, Tron); absent for the chain's own coin. */
  contract?: string;
  /**
   * Read at the wallet's Tangem yield module instead of the address itself:
   * Tangem's "yield mode" moves the token into a contract deployed for the
   * owner, which supplies it to Aave and holds the aToken (see
   * `TANGEM_YIELD_FACTORY`). The address alone then shows none of it.
   */
  holder?: "tangemYield";
}

/**
 * Tangem's yield-module factory. Its `yieldModules(owner)` view gives the
 * module an address deployed (zero if none). Found from the owner's own
 * `deployYieldModule` transaction on Arbitrum; asked on Ethereum too, where a
 * factory that is not there answers "0x" and so reads as no module.
 */
export const TANGEM_YIELD_FACTORY = "0xb49CF4ba3c821560b5A4E6474D28f547368346CF";
/** `yieldModules(address)` selector. */
export const YIELD_MODULES_SELECTOR = "0x36571e2c";

/**
 * What is looked for at each address: the chain's own coin plus the tokens
 * people actually keep there. On Arbitrum, USDC comes in three forms — native,
 * bridged (USDC.e) and supplied to Aave (aArbUSDCn, whose balance grows with
 * the interest) — and each is read, since a wallet app shows them all as
 * "USDC".
 */
export const WALLET_ASSETS: WalletAsset[] = [
  { key: "bitcoin:BTC", chain: "bitcoin", symbol: "BTC", name: "Bitcoin", coingecko: "bitcoin", decimals: 8 },
  { key: "ethereum:ETH", chain: "ethereum", symbol: "ETH", name: "Ethereum", coingecko: "ethereum", decimals: 18 },
  { key: "ethereum:USDT", chain: "ethereum", symbol: "USDT", name: "Tether · Ethereum", coingecko: "tether", decimals: 6, contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { key: "ethereum:USDC", chain: "ethereum", symbol: "USDC", name: "USDC · Ethereum", coingecko: "usd-coin", decimals: 6, contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { key: "ethereum:PAXG", chain: "ethereum", symbol: "PAXG", name: "PAX Gold", coingecko: "pax-gold", decimals: 18, contract: "0x45804880De22913dAFE09f4980848ECE6EcbAf78" },
  { key: "arbitrum:ETH", chain: "arbitrum", symbol: "ETH", name: "Ethereum · Arbitrum", coingecko: "ethereum", decimals: 18 },
  { key: "arbitrum:USDC", chain: "arbitrum", symbol: "USDC", name: "USDC · Arbitrum", coingecko: "usd-coin", decimals: 6, contract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  { key: "arbitrum:USDC.e", chain: "arbitrum", symbol: "USDC", name: "USDC.e · Arbitrum", coingecko: "usd-coin", decimals: 6, contract: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8" },
  { key: "arbitrum:aUSDC", chain: "arbitrum", symbol: "USDC", name: "USDC in Aave · Arbitrum", coingecko: "usd-coin", decimals: 6, contract: "0x724dc807b04555b71ed48a6896b6F41593b8C637" },
  { key: "arbitrum:USDT", chain: "arbitrum", symbol: "USDT", name: "Tether · Arbitrum", coingecko: "tether", decimals: 6, contract: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
  { key: "arbitrum:USDC.yield", chain: "arbitrum", symbol: "USDC", name: "USDC · Tangem yield (Aave) · Arbitrum", coingecko: "usd-coin", decimals: 6, contract: "0x724dc807b04555b71ed48a6896b6F41593b8C637", holder: "tangemYield" },
  { key: "arbitrum:USDT.yield", chain: "arbitrum", symbol: "USDT", name: "Tether · Tangem yield (Aave) · Arbitrum", coingecko: "tether", decimals: 6, contract: "0x6ab707Aca953eDAeFBc4fD23bA73294241490620", holder: "tangemYield" },
  { key: "ethereum:USDC.yield", chain: "ethereum", symbol: "USDC", name: "USDC · Tangem yield (Aave) · Ethereum", coingecko: "usd-coin", decimals: 6, contract: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c", holder: "tangemYield" },
  { key: "ethereum:USDT.yield", chain: "ethereum", symbol: "USDT", name: "Tether · Tangem yield (Aave) · Ethereum", coingecko: "tether", decimals: 6, contract: "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a", holder: "tangemYield" },
  { key: "tron:TRX", chain: "tron", symbol: "TRX", name: "Tron", coingecko: "tron", decimals: 6 },
  { key: "tron:USDT", chain: "tron", symbol: "USDT", name: "Tether · Tron", coingecko: "tether", decimals: 6, contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
  { key: "ton:TON", chain: "ton", symbol: "TON", name: "Gram (Toncoin)", coingecko: "the-open-network", decimals: 9 },
  { key: "solana:SOL", chain: "solana", symbol: "SOL", name: "Solana", coingecko: "solana", decimals: 9 },
  { key: "near:NEAR", chain: "near", symbol: "NEAR", name: "NEAR Protocol", coingecko: "near", decimals: 24 },
  { key: "xrp:XRP", chain: "xrp", symbol: "XRP", name: "XRP", coingecko: "ripple", decimals: 6 },
  { key: "litecoin:LTC", chain: "litecoin", symbol: "LTC", name: "Litecoin", coingecko: "litecoin", decimals: 8 },
  { key: "dash:DASH", chain: "dash", symbol: "DASH", name: "Dash", coingecko: "dash", decimals: 8 },
];

export function assetsOn(chain: Chain): WalletAsset[] {
  return WALLET_ASSETS.filter((a) => a.chain === chain);
}

export function assetByKey(key: string): WalletAsset | undefined {
  return WALLET_ASSETS.find((a) => a.key === key);
}

// --- Amounts ---------------------------------------------------------------

/** An integer amount in the chain's smallest unit (string, number or bigint) as a coin amount. */
export function fromUnits(raw: string | number | bigint, decimals: number): number | null {
  let n: bigint;
  try {
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) return null;
      n = BigInt(raw);
    } else if (typeof raw === "bigint") {
      n = raw;
    } else {
      const s = raw.trim();
      if (!/^(0x[0-9a-fA-F]*|\d+)$/.test(s)) return null;
      n = s === "0x" ? 0n : BigInt(s);
    }
  } catch {
    return null;
  }
  if (n < 0n) return null;
  const scale = 10n ** BigInt(decimals);
  const whole = n / scale;
  const frac = (n % scale).toString().padStart(decimals, "0");
  return Number(`${whole}.${frac || "0"}`);
}

// --- Addresses -------------------------------------------------------------

const B58 = "[1-9A-HJ-NP-Za-km-z]";
const PATTERNS: Record<Exclude<AddressKind, "ton" | "near">, RegExp> = {
  evm: /^0x[0-9a-fA-F]{40}$/,
  tron: new RegExp(`^T${B58}{33}$`),
  solana: new RegExp(`^${B58}{32,44}$`),
  xrp: new RegExp(`^r${B58}{24,34}$`),
  bitcoin: new RegExp(`^(bc1[02-9ac-hj-np-z]{11,87}|[13]${B58}{25,34})$`),
  litecoin: new RegExp(`^(ltc1[02-9ac-hj-np-z]{11,87}|[LM3]${B58}{25,34})$`),
  dash: new RegExp(`^[X7]${B58}{33}$`),
};

/** Whether `address` can be one on that network (shape, and TON's checksum). */
export function isValidAddress(kind: AddressKind, address: string): boolean {
  const a = address.trim();
  if (kind === "ton") return isTonAddress(a);
  if (kind === "near") {
    // An implicit account (64 hex) or a named one (alice.near).
    return /^[0-9a-f]{64}$/.test(a) || (a.length >= 2 && a.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(a));
  }
  return PATTERNS[kind].test(a);
}

/**
 * A TON address: raw `0:<64 hex>`, or the usual 48-character base64 form,
 * which ends in a CRC16 of the rest — so a letter misread from a screenshot
 * (an I for an l) is caught here instead of failing on every sync.
 */
function isTonAddress(a: string): boolean {
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(a)) return true;
  if (!/^[A-Za-z0-9_+/-]{48}$/.test(a)) return false;
  const bytes = base64Bytes(a);
  if (!bytes || bytes.length !== 36) return false;
  return crc16(bytes.subarray(0, 34)) === ((bytes[34] << 8) | bytes[35]);
}

function base64Bytes(s: string): Uint8Array | null {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = s.replace(/-/g, "+").replace(/_/g, "/");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = alphabet.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function crc16(bytes: Uint8Array): number {
  let c = 0;
  for (const b of bytes) {
    c ^= b << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c;
}

// --- Parsers ---------------------------------------------------------------

function get(obj: unknown, ...path: (string | number)[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/** ABI data for a call taking one address argument. */
export function callWithAddress(selector: string, address: string): string {
  return selector + address.slice(2).toLowerCase().padStart(64, "0");
}

/**
 * An `eth_call` that returns an address (`yieldModules`): the address, or
 * null for the zero address or an empty "0x" (no contract there). Undefined
 * when the response is not one.
 */
export function parseEvmAddress(json: unknown): string | null | undefined {
  const r = get(json, "result");
  if (typeof r !== "string" || !/^0x[0-9a-fA-F]*$/.test(r)) return undefined;
  if (r.length < 42) return null;
  const a = "0x" + r.slice(-40);
  return /^0x0{40}$/.test(a) ? null : a;
}

/** EVM JSON-RPC `eth_getBalance` / `eth_call balanceOf`: `{ result: "0x…" }`. */
export function parseEvm(json: unknown, decimals: number): number | null {
  const r = get(json, "result");
  return typeof r === "string" ? fromUnits(r, decimals) : null;
}

/**
 * TronGrid `GET /v1/accounts/<addr>`: `{ success, data: [{ balance: <sun>,
 * trc20: [{ <contract>: "<units>" }] }] }`. An address never used has no
 * account yet (`data: []`) — that is a zero balance, not an error; so is a
 * missing `balance` (TronGrid leaves out zero fields).
 */
export function parseTron(json: unknown, asset: WalletAsset): number | null {
  if (get(json, "success") !== true) return null;
  const data = get(json, "data");
  if (!Array.isArray(data)) return null;
  const acct = data[0];
  if (!acct) return 0;
  if (!asset.contract) {
    const b = get(acct, "balance");
    return b === undefined ? 0 : typeof b === "number" ? fromUnits(b, asset.decimals) : null;
  }
  const tokens = get(acct, "trc20");
  if (!Array.isArray(tokens)) return 0;
  for (const t of tokens) {
    const v = get(t, asset.contract);
    if (typeof v === "string") return fromUnits(v, asset.decimals);
  }
  return 0;
}

/** Toncenter `GET /api/v2/getAddressBalance`: `{ ok: true, result: "<nanotons>" }`. */
export function parseToncenter(json: unknown): number | null {
  if (get(json, "ok") !== true) return null;
  const r = get(json, "result");
  return typeof r === "string" || typeof r === "number" ? fromUnits(String(r), 9) : null;
}

/** Solana RPC `getBalance`: `{ result: { value: <lamports> } }`. */
export function parseSolana(json: unknown): number | null {
  const v = get(json, "result", "value");
  return typeof v === "number" ? fromUnits(v, 9) : null;
}

/**
 * NEAR RPC `view_account`: `{ result: { amount: "<yocto>", locked } }`. An
 * account that does not exist yet (nothing ever sent to it) is zero.
 */
export function parseNear(json: unknown): number | null {
  const amount = get(json, "result", "amount");
  if (typeof amount === "string") return fromUnits(amount, 24);
  const cause = get(json, "error", "cause", "name");
  return cause === "UNKNOWN_ACCOUNT" ? 0 : null;
}

/** The XRP a ledger account must keep: 1 XRP, plus 0.2 per trust line/offer it owns. */
export const XRP_BASE_RESERVE = 1;
export const XRP_OWNER_RESERVE = 0.2;

/**
 * rippled `account_info`: `{ result: { account_data: { Balance: "<drops>",
 * OwnerCount } } }`. The reserve can never be sent, so, as wallet apps do,
 * only what is above it counts. An unfunded account (`actNotFound`) is zero.
 */
export function parseXrp(json: unknown): number | null {
  const data = get(json, "result", "account_data");
  if (!data) return get(json, "result", "error") === "actNotFound" ? 0 : null;
  const drops = get(data, "Balance");
  const owners = get(data, "OwnerCount");
  const total = typeof drops === "string" ? fromUnits(drops, 6) : null;
  if (total === null) return null;
  const reserve = XRP_BASE_RESERVE + XRP_OWNER_RESERVE * (typeof owners === "number" ? owners : 0);
  return Math.max(0, Math.round((total - reserve) * 1e6) / 1e6);
}

/** BlockCypher `GET /v1/<coin>/main/addrs/<addr>/balance`: `{ final_balance: <satoshi> }`. */
export function parseBlockcypher(json: unknown): number | null {
  const b = get(json, "final_balance");
  return typeof b === "number" ? fromUnits(b, 8) : null;
}

// --- Keeping a holding in step ---------------------------------------------

/**
 * The cost basis of a wallet holding after its balance moved. The chain says
 * how much there is, not what was paid, so: a new holding starts at today's
 * value (no invented gain or loss), coins that arrived are added at today's
 * price, and coins that left take their share of the cost with them (as a
 * sale does). The owner can still correct the cost by editing the holding;
 * that stands until the balance next changes.
 */
export function walletCostBasis(prev: { quantity: number; costBasis: number } | null, quantity: number, price: number): number {
  if (!prev || prev.quantity <= 0) return quantity * price;
  if (quantity > prev.quantity) return prev.costBasis + (quantity - prev.quantity) * price;
  if (quantity < prev.quantity) return (prev.costBasis * quantity) / prev.quantity;
  return prev.costBasis;
}

/** Below a cent a balance is dust (a reserve's rounding, an airdrop's remains): no holding for it. */
export const DUST_USD = 0.01;
