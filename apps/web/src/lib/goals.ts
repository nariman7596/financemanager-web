import "server-only";
import { prisma } from "./prisma";
import { loadRates } from "./currency";
import { getAccountBalances } from "./queries";
import { convert } from "@financemanager/core/currency";
import { toNumber } from "@financemanager/core/money";
import { goalProgress, splitSavings, type GoalProgress } from "@financemanager/core/goals";
import type { Locale } from "@financemanager/i18n/config";
import { getPlannerInputs } from "./budgetPlan";

export type GoalView = {
  id: string;
  name: string;
  target: number;
  currency: string;
  targetDate: Date | null;
  source: "MANUAL" | "LINKED";
  accountIds: string[];
  investmentIds: string[];
  saved: number;
  /** Set aside this month (MANUAL only; a LINKED goal has no history). */
  thisMonth: number | null;
  progress: GoalProgress;
  /** Names of what a LINKED goal counts, for the card. */
  linkedNames: string[];
};

/**
 * Every goal of a household with what it holds, in the goal's currency. A
 * LINKED goal holds the balances of its accounts and the value of its
 * holdings; a MANUAL one the sum of what was set aside for it.
 */
export async function getGoals(householdId: string, monthStart: Date, now = new Date()): Promise<GoalView[]> {
  const goals = await prisma.goal.findMany({
    where: { householdId },
    orderBy: [{ targetDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: { contributions: { select: { amount: true, date: true } } },
  });
  if (goals.length === 0) return [];

  const needsLinks = goals.some((g) => g.source === "LINKED");
  const [rates, balances, holdings] = await Promise.all([
    loadRates(),
    needsLinks ? getAccountBalances(householdId) : Promise.resolve([]),
    needsLinks
      ? prisma.investment.findMany({
          where: { householdId, heldForId: null },
          select: { id: true, symbol: true, quantity: true, currentPrice: true, currency: true },
        })
      : Promise.resolve([]),
  ]);
  const accountById = new Map(balances.map((a) => [a.id, a]));
  const holdingById = new Map(holdings.map((h) => [h.id, h]));

  return goals.map((g) => {
    const currency = g.currency;
    const source = g.source === "LINKED" ? "LINKED" : "MANUAL";
    let saved = 0;
    let thisMonth: number | null = null;
    const linkedNames: string[] = [];
    if (source === "LINKED") {
      for (const id of g.accountIds) {
        const a = accountById.get(id);
        if (!a) continue;
        saved += convert(a.balance, a.currency, currency, rates);
        linkedNames.push(a.name);
      }
      for (const id of g.investmentIds) {
        const h = holdingById.get(id);
        if (!h) continue;
        saved += convert(toNumber(h.quantity) * toNumber(h.currentPrice), h.currency, currency, rates);
        linkedNames.push(h.symbol);
      }
    } else {
      saved = g.contributions.reduce((s, c) => s + toNumber(c.amount), 0);
      thisMonth = g.contributions
        .filter((c) => c.date.getTime() >= monthStart.getTime())
        .reduce((s, c) => s + toNumber(c.amount), 0);
    }
    const target = toNumber(g.targetAmount);
    return {
      id: g.id,
      name: g.name,
      target,
      currency,
      targetDate: g.targetDate,
      source,
      accountIds: g.accountIds,
      investmentIds: g.investmentIds,
      saved,
      thisMonth,
      progress: goalProgress({ target, saved, targetDate: g.targetDate }, now, g.createdAt),
      linkedNames,
    };
  });
}

/**
 * The monthly savings the budget planner sets aside (suggested income × the
 * saved savings rate), shared between the goals by `splitSavings`. Null when
 * the planner has never been saved — there is no savings figure to share yet.
 */
export async function getGoalSplit(householdId: string, base: string, locale: Locale, goals: GoalView[]) {
  const inputs = await getPlannerInputs(householdId, base, locale);
  if (!inputs.saved || inputs.income <= 0) return null;
  const monthly = Math.round(inputs.income * inputs.saved.savingsRate);
  const rates = await loadRates();
  const split = splitSavings(
    monthly,
    goals.map((g) => ({
      id: g.id,
      remaining: convert(g.progress.remaining, g.currency, base, rates),
      monthsLeft: g.progress.status === "overdue" ? 1 : g.progress.monthsLeft,
    })),
  );
  return { monthly, ...split };
}
