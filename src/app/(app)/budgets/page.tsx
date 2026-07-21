import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBaseCurrency, getBudgetProgress } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { BudgetForm } from "@/components/forms/BudgetForm";
import { BudgetBar } from "@/components/BudgetBar";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteBudget } from "@/app/actions/budgets";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const user = await requireUser();
  const base = await getBaseCurrency(user.userId);

  const [expenseCategories, budgets] = await Promise.all([
    prisma.category.findMany({
      where: { userId: user.userId, type: "EXPENSE", isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getBudgetProgress(user.userId),
  ]);

  const monthName = new Date().toLocaleString("en-US", { month: "long" });

  return (
    <>
      <Topbar
        title="Budgets"
        subtitle={`Spending limits · ${monthName}`}
        action={
          expenseCategories.length > 0 ? (
            <Modal
              title="Set a budget"
              trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
            >
              <BudgetForm categories={expenseCategories} defaultCurrency={base} />
            </Modal>
          ) : null
        }
      />

      {budgets.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No budgets yet. Set spending limits per category to stay on track.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {budgets.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="badge" style={{ backgroundColor: `${b.color}1a`, color: b.color }}>
                  {b.period.toLowerCase()}
                </span>
                <DeleteButton action={deleteBudget} id={b.id} label="Delete budget" />
              </div>
              <BudgetBar budget={b} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
