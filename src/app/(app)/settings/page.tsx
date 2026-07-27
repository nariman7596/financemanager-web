import { Plus } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { SettingsForm } from "@/components/forms/SettingsForm";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteCategory } from "@/app/actions/categories";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireHousehold();
  const [user, categories] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId } }),
    prisma.category.findMany({
      where: { householdId: ctx.householdId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  const income = categories.filter((c) => c.type === "INCOME");
  const expense = categories.filter((c) => c.type === "EXPENSE");
  const canEdit = ctx.role !== "VIEWER";

  return (
    <>
      <Topbar title="Settings" subtitle="Your profile and this household's categories" />

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Profile</h2>
          <SettingsForm name={user?.name ?? ""} />
          <p className="text-xs text-slate-400 mt-4">Signed in as {user?.email}</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Categories</h2>
              <p className="text-xs text-slate-400">Shared across this household</p>
            </div>
            {canEdit && (
              <Modal
                title="New category"
                trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
              >
                <CategoryForm />
              </Modal>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <CategoryList title="Income" items={income} canEdit={canEdit} />
            <CategoryList title="Expense" items={expense} canEdit={canEdit} />
          </div>
        </div>
      </div>
    </>
  );
}

function CategoryList({
  title,
  items,
  canEdit,
}: {
  title: string;
  items: { id: string; name: string; color: string }[];
  canEdit: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      <ul className="space-y-1">
        {items.length === 0 && <li className="text-sm text-slate-400">None</li>}
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 row-hover">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
            {canEdit && <DeleteButton action={deleteCategory} id={c.id} label="Delete category" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
