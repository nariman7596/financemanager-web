import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { getBaseCurrency, getNetWorth } from "./queries";
import { getMarketQuotes } from "./iranMarket";
import { classValues } from "./allocation";
import { allocate } from "@financemanager/core/allocation";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { dayOf, netWorthSeries, sampleDays, type NetWorthPoint } from "@financemanager/core/networth";

/** A toman-per-USDT rate in the household's base currency; null outside toman/rial. */
function rateIn(base: string, toman: number | null): number | null {
  if (!toman) return null;
  if (base === "IRT") return toman;
  if (base === "IRR") return toman * 10;
  return null;
}

/**
 * Today's worth of every household (or one): cash, holdings at market value,
 * and the day's dollar rate. Run by the hourly refresh; the last run of the
 * day overwrites the earlier ones, so the day ends on its latest prices.
 */
export async function takeNetWorthSnapshots(householdId?: string, now = new Date()): Promise<number> {
  const households = await prisma.household.findMany({
    where: householdId ? { id: householdId } : {},
    select: { id: true },
  });
  const usdt = (await getMarketQuotes(["USDT"])).get("USDT")?.consensus?.price ?? null;
  const day = dayOf(now);
  let n = 0;
  for (const h of households) {
    const base = await getBaseCurrency(h.id);
    const w = await getNetWorth(h.id, base);
    // The day's mix of assets, for the allocation trend.
    const { items } = await classValues(h.id, base);
    const classes = Object.fromEntries(allocate(items).rows.map((r) => [r.cls, Math.round(r.value)]));
    await prisma.netWorthSnapshot.upsert({
      where: { householdId_day: { householdId: h.id, day } },
      create: { householdId: h.id, day, currency: base, cash: w.cash, investments: w.investments, usdRate: usdt, classes },
      update: { currency: base, cash: w.cash, investments: w.investments, usdRate: usdt, classes },
    });
    n++;
  }
  return n;
}

export type NetWorthHistory = {
  points: { day: string; total: number; usd: number | null }[];
  currency: string;
};

/**
 * Daily worth from the household's first day to today (sampled down past two
 * years), in the base currency. See core/networth for how each day is built.
 */
export async function getNetWorthHistory(householdId: string, base: string, now = new Date()): Promise<NetWorthHistory> {
  const [rates, accounts, flows, holdings, snapshots] = await Promise.all([
    loadRates(),
    prisma.account.findMany({
      where: { householdId, isArchived: false },
      select: { openingBalance: true, currency: true, createdAt: true },
    }),
    prisma.transaction.findMany({
      where: { householdId, type: { in: ["INCOME", "EXPENSE"] } },
      select: { type: true, amount: true, currency: true, date: true },
    }),
    prisma.investment.findMany({
      where: { householdId, heldForId: null },
      select: { costBasis: true, currency: true, purchaseDate: true },
    }),
    prisma.netWorthSnapshot.findMany({
      where: { householdId },
      orderBy: { day: "asc" },
      select: { day: true, currency: true, investments: true, usdRate: true },
    }),
  ]);
  if (accounts.length === 0) return { points: [], currency: base };

  const starts = [
    ...accounts.map((a) => a.createdAt),
    ...flows.map((f) => f.date),
  ].map((d) => d.getTime());
  const from = new Date(Math.min(...starts));
  const days = sampleDays(from, now, 730);

  const series: NetWorthPoint[] = netWorthSeries(
    {
      opening: accounts.reduce((s, a) => s + convert(toNumber(a.openingBalance), a.currency, base, rates), 0),
      flows: flows.map((f) => ({
        day: f.date,
        delta: (f.type === "INCOME" ? 1 : -1) * convert(toNumber(f.amount), f.currency, base, rates),
      })),
      holdings: holdings.map((h) => ({ since: h.purchaseDate, cost: convert(toNumber(h.costBasis), h.currency, base, rates) })),
      snapshots: snapshots.map((s) => ({
        day: s.day,
        investments: convert(toNumber(s.investments), s.currency, base, rates),
        usdRate: rateIn(base, s.usdRate === null ? null : toNumber(s.usdRate)),
      })),
    },
    days,
  );
  return {
    currency: base,
    points: series.map((p) => ({ day: p.day.toISOString().slice(0, 10), total: Math.round(p.total), usd: p.usd === null ? null : Math.round(p.usd) })),
  };
}
