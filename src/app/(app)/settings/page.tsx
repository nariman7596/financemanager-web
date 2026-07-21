import { Plus } from "lucide-react";
import { requireUser, currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { SettingsForm } from "@/components/forms/SettingsForm";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteCategory } from "@/app/actions/categories";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireUser();
  const [user, categories] = await Promise.all([
    currentUser(),
    prisma.category.findMany({
      where: { userId: session.userId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  const income = categories.filter((c) => c.type === "INCOME");
  const expense = categories.filter((c) => c.type === "EXPENSE");

  return (
    <>
      <Topbar title="Settings" subtitle="Profile, currency and categories" />

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Profile</h2>
          <SettingsForm name={user?.name ?? ""} baseCurrency={user?.baseCurrency ?? "USD"} />
          <p className="text-xs text-slate-400 mt-4">Signed in as {user?.email}</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Categories</h2>
            <Modal
              title="New category"
              trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
            >
              <CategoryForm />
            </Modal>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <CategoryList title="Income" items={income} />
            <CategoryList title="Expense" items={expense} />
          </div>
        </div>
      </div>
    </>
  );
}

function CategoryList({
  title,
  items,
}: {
  title: string;
  items: { id: string; name: string; color: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      <ul className="space-y-1">
        {items.length === 0 && <li className="text-sm text-slate-400">None</li>}
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
            <DeleteButton action={deleteCategory} id={c.id} label="Delete category" />
          </li>
        ))}
      </ul>
    </div>
  );
}
