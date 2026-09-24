import { requireHousehold } from "@/lib/household";
import { getBaseCurrency } from "@/lib/queries";
import { getPlannerInputs } from "@/lib/budgetPlan";
import { Topbar } from "@/components/Topbar";
import { BudgetPlanner } from "@/components/BudgetPlanner";
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BudgetPlanPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold("MEMBER");
  const base = await getBaseCurrency(ctx.householdId);
  const inputs = await getPlannerInputs(ctx.householdId, base, locale);

  return (
    <>
      <Topbar title={t("planner.title")} subtitle={t("planner.subtitle")} />
      <BudgetPlanner currency={base} {...inputs} />
    </>
  );
}
