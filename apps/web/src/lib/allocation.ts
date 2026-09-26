import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { getAccountBalances } from "./queries";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { ASSET_CLASSES, allocate, classOf, parseTargets, type AssetClass } from "@financemanager/core/allocation";

/**
 * Value per asset class, in the base currency: own holdings by `classOf`,
 * bank and cash accounts as toman cash (or foreign currency, if the account
 * is in one). Persons' accounts and holdings kept for them are theirs; loans
 * are debts, returned apart.
 */
export async function classValues(householdId: string, base: string) {
  const [rates, balances, holdings] = await Promise.all([
    loadRates(),
    getAccountBalances(householdId),
    prisma.investment.findMany({
      where: { householdId, heldForId: null },
      select: { type: true, symbol: true, name: true, allocClass: true, quantity: true, currentPrice: true, currency: true },
    }),
  ]);
  const items: { cls: AssetClass; value: number }[] = [];
  let debts = 0;
  for (const a of balances) {
    const v = convert(a.balance, a.currency, base, rates);
    if (a.type === "PERSON") continue;
    if (a.type === "LOAN" || v < 0) {
      debts += -Math.min(0, v);
      continue;
    }
    items.push({ cls: a.currency === "IRT" || a.currency === "IRR" ? "CASH" : "USD", value: v });
  }
  for (const h of holdings) {
    items.push({ cls: classOf(h), value: convert(toNumber(h.quantity) * toNumber(h.currentPrice), h.currency, base, rates) });
  }
  return { items, debts };
}

export async function getAllocation(householdId: string, base: string) {
  const [{ items, debts }, household, snapshots] = await Promise.all([
    classValues(householdId, base),
    prisma.household.findUnique({ where: { id: householdId }, select: { allocationTargets: true } }),
    prisma.netWorthSnapshot.findMany({
      where: { householdId, classes: { not: undefined } },
      orderBy: { day: "asc" },
      select: { day: true, classes: true },
      take: 400,
    }),
  ]);
  const targets = parseTargets(household?.allocationTargets) ?? {};
  const { total, rows } = allocate(items, targets);

  // Each day's shares, for the trend (days recorded since this was added).
  const history = snapshots.flatMap((s) => {
    const c = s.classes as Record<string, number> | null;
    if (!c) return [];
    const sum = ASSET_CLASSES.reduce((acc, k) => acc + Math.max(0, Number(c[k]) || 0), 0);
    if (sum <= 0) return [];
    const point: Record<string, number | string> = { day: s.day.toISOString().slice(0, 10) };
    for (const k of ASSET_CLASSES) point[k] = Math.max(0, Number(c[k]) || 0) / sum;
    return [point];
  });
  return { total, rows, debts, targets, hasTargets: Object.keys(targets).length > 0, history };
}
