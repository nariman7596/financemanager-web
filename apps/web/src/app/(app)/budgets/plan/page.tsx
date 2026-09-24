import { requireHousehold } from "@/lib/household";
import { getBaseCurrency } from "@/lib/queries";
import { getPlannerInputs } from "@/lib/budgetPlan";
import { getGoals } from "@/lib/goals";
import { loadRates } from "@/lib/currency";
import { convert } from "@financemanager/core/currency";
import { startOfMonthIn } from "@financemanager/core/calendar";
import { Topbar } from "@/components/Topbar";
import { BudgetPlanner } from "@/components/BudgetPlanner";
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BudgetPlanPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold("MEMBER");
  const base = await getBaseCurrency(ctx.householdId);
  const now = new Date();
  const [inputs, goals, rates] = await Promise.all([
    getPlannerInputs(ctx.householdId, base, locale),
    getGoals(ctx.householdId, startOfMonthIn(now, locale), now),
    loadRates(),
  ]);
  // What each unfinished goal still needs, in the planner's currency.
  const goalNeeds = goals
    .filter((g) => g.progress.remaining > 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      remaining: convert(g.progress.remaining, g.currency, base, rates),
      monthsLeft: g.progress.status === "overdue" ? 1 : g.progress.monthsLeft,
    }));

  return (
    <>
      <Topbar title={t("planner.title")} subtitle={t("planner.subtitle")} />
      <BudgetPlanner currency={base} {...inputs} goals={goalNeeds} />
    </>
  );
}
