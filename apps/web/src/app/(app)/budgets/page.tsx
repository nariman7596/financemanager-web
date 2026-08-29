import { Plus } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { getBaseCurrency, getBudgetProgress } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { BudgetForm } from "@/components/forms/BudgetForm";
import { BudgetBar } from "@/components/BudgetBar";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteBudget } from "@/app/actions/budgets";
import { getT, getLocale } from "@/lib/i18n/server";
import { monthNameIn } from "@financemanager/core/calendar";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);

  const [expenseCategories, budgets] = await Promise.all([
    prisma.category.findMany({
      where: { householdId: ctx.householdId, type: "EXPENSE", isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getBudgetProgress(ctx.householdId, new Date(), locale),
  ]);

  const monthName = monthNameIn(new Date(), locale);

  return (
    <>
      <Topbar
        title={t("budgets.title")}
        subtitle={t("budgets.subtitle", { month: monthName })}
        action={
          expenseCategories.length > 0 ? (
            <Modal
              title={t("budgets.set")}
              trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}
            >
              <BudgetForm categories={expenseCategories} defaultCurrency={base} />
            </Modal>
          ) : null
        }
      />

      {budgets.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          {t("budgets.empty")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {budgets.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="badge" style={{ backgroundColor: `${b.color}1a`, color: b.color }}>
                  {t("enum.period." + b.period)}
                </span>
                <DeleteButton action={deleteBudget} id={b.id} label={t("budgets.deleteBudget")} />
              </div>
              <BudgetBar budget={b} t={t} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
