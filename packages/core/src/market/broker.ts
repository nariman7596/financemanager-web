/**
 * A broker's portfolio export (Mofid's Easytrader "Portfolio export" .xlsx)
 * read into holdings. The file is the source of truth for what is held and
 * what it cost — the broker counts fees and dividends the way the owner sees
 * them — so a new export simply replaces the previous import.
 *
 * Pure: the .xlsx container is unzipped by the app; this reads the sheet XML
 * (inline, shared or plain string cells) and the table in it. Columns are
 * found by their Persian header, not position, and rial amounts stay rial.
 */

const COLS = {
  symbol: "نام نماد",
  quantity: "تعداد دارایی",
  last: "آخرین قیمت",
  close: "قیمت پایانی",
  // What "سود و زیان فعلی" in the same file is measured against: value less
  // quantity × this. Using it keeps the app's gain equal to the broker's.
  avgCost: "قیمت میانگین خرید در آخرین دوره با لحاظ کارمزد",
  name: "توضیح نماد",
} as const;

export interface BrokerHolding {
  symbol: string;
  name: string;
  quantity: number;
  /** Rial per share: the closing price, or the last trade when there is none. */
  priceRial: number;
  /** Rial per share, fees included. */
  avgCostRial: number;
  /** A fund (صندوق) rather than a company's shares. */
  isFund: boolean;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

/** `sharedStrings.xml` → its strings, in order. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    out.push(unescapeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  }
  return out;
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** A worksheet's XML → rows of cell text, placed by each cell's column. */
export function parseSheetXml(xml: string, shared: string[] = []): string[][] {
  const rows: string[][] = [];
  for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const c of row.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const attrs = c.match(/^<c\b([^>]*)/)![1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = c.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      const inline = c.match(/<is>([\s\S]*?)<\/is>/)?.[1];
      let text = "";
      if (type === "s" && v !== undefined) text = shared[Number(v)] ?? "";
      else if (inline !== undefined) text = (inline.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("");
      else if (v !== undefined) text = v;
      const i = ref ? columnIndex(ref) : cells.length;
      while (cells.length < i) cells.push("");
      cells[i] = unescapeXml(text);
    }
    rows.push(cells);
  }
  return rows;
}

// Arabic yeh/kaf and stray zero-width marks do not make a different header.
const norm = (s: string) => s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200f\u200e]/g, " ").replace(/\s+/g, " ").trim();
const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The holdings in a broker export, or null when the file is not one (a
 * column it needs is missing). Rows without shares are skipped.
 */
export function parseBrokerPortfolio(rows: string[][]): BrokerHolding[] | null {
  const header = rows[0]?.map(norm);
  if (!header) return null;
  const at = (name: string) => header.indexOf(norm(name));
  const idx = { symbol: at(COLS.symbol), quantity: at(COLS.quantity), last: at(COLS.last), close: at(COLS.close), avgCost: at(COLS.avgCost), name: at(COLS.name) };
  if (idx.symbol < 0 || idx.quantity < 0 || idx.avgCost < 0 || (idx.close < 0 && idx.last < 0)) return null;

  const out: BrokerHolding[] = [];
  for (const r of rows.slice(1)) {
    const symbol = norm(r[idx.symbol] ?? "");
    const quantity = num(r[idx.quantity]);
    if (!symbol || !(quantity > 0)) continue;
    const close = idx.close >= 0 ? num(r[idx.close]) : NaN;
    const last = idx.last >= 0 ? num(r[idx.last]) : NaN;
    const priceRial = close > 0 ? close : last > 0 ? last : 0;
    const avgCostRial = num(r[idx.avgCost]);
    const name = idx.name >= 0 ? norm(r[idx.name] ?? "") : "";
    out.push({
      symbol,
      name: name || symbol,
      quantity,
      priceRial,
      avgCostRial: avgCostRial > 0 ? avgCostRial : 0,
      isFund: /^صندوق/.test(name),
    });
  }
  return out;
}

// --- Prices between imports (rahavard365) -----------------------------------

/**
 * The Tehran exchange's own sites (TSETMC) do not answer from the German
 * server; rahavard365's API does. A symbol is looked up once
 * (`/api/v2/search?keyword=`) and its asset read (`/api/v2/asset/<id>`).
 */

/** The asset id of exactly this trade symbol in a rahavard search, or null. */
export function parseRahavardSearch(json: unknown, symbol: string): string | null {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return null;
  const want = norm(symbol);
  for (const d of data) {
    const r = d as Record<string, unknown>;
    if (r.entity_type === "exchange.asset" && typeof r.trade_symbol === "string" && norm(r.trade_symbol) === want) {
      const id = r.entity_id;
      if (typeof id === "string" || typeof id === "number") return String(id);
    }
  }
  return null;
}

/**
 * A rahavard asset: `{ data: { last_trade: { close_price, end_date_time } } }`.
 * `close_price` is the closing (پایانی) price the broker values at;
 * `real_close_price` is the last trade. Rial.
 */
export function parseRahavardAsset(json: unknown): { rial: number; asOf: Date | null } | null {
  const lt = ((json as { data?: { last_trade?: Record<string, unknown> } })?.data?.last_trade) ?? null;
  if (!lt) return null;
  const close = Number(lt.close_price);
  const rial = close > 0 ? close : Number(lt.real_close_price);
  if (!(rial > 0)) return null;
  const at = typeof lt.end_date_time === "string" ? new Date(lt.end_date_time) : null;
  return { rial, asOf: at && !Number.isNaN(at.getTime()) ? at : null };
}
