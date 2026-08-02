import { Plus } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { SettingsForm } from "@/components/forms/SettingsForm";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteCategory } from "@/app/actions/categories";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getT } from "@/lib/i18n/server";
import type { TFunc } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = await getT();
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
      <Topbar title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-4">{t("settings.profile")}</h2>
          <SettingsForm name={user?.name ?? ""} />
          <p className="text-xs text-slate-400 mt-4">{t("settings.signedInAs", { email: user?.email ?? "" })}</p>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-1">{t("settings.language")}</h2>
          <p className="text-xs text-slate-400 mb-3">{t("settings.languageHint")}</p>
          <div className="max-w-xs border border-[var(--border)] rounded-lg">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">{t("settings.categories")}</h2>
              <p className="text-xs text-slate-400">{t("settings.categoriesHint")}</p>
            </div>
            {canEdit && (
              <Modal
                title={t("settings.newCategory")}
                trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}
              >
                <CategoryForm />
              </Modal>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <CategoryList title={t("settings.income")} items={income} canEdit={canEdit} t={t} />
            <CategoryList title={t("settings.expense")} items={expense} canEdit={canEdit} t={t} />
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
  t,
}: {
  title: string;
  items: { id: string; name: string; color: string }[];
  canEdit: boolean;
  t: TFunc;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      <ul className="space-y-1">
        {items.length === 0 && <li className="text-sm text-slate-400">{t("common.none")}</li>}
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 row-hover">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
            {canEdit && <DeleteButton action={deleteCategory} id={c.id} label={t("catForm.deleteCategory")} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
