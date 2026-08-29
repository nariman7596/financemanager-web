import { Plus, Pencil } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@financemanager/db";
import { formatMoney, formatDate, toNumber } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { RecurringForm } from "@/components/forms/RecurringForm";
import { RunRecurringButton } from "@/components/RunRecurringButton";
import { RecurringToggle } from "@/components/RecurringToggle";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteRecurring } from "@/app/actions/recurring";
import { getT, getLocale } from "@/lib/i18n/server";
import type { TFunc } from "@financemanager/i18n/translate";

export const dynamic = "force-dynamic";

function cadence(t: TFunc, interval: number, frequency: string) {
  const unitKey: Record<string, string> = {
    DAILY: "recurring.unit.day",
    WEEKLY: "recurring.unit.week",
    MONTHLY: "recurring.unit.month",
    YEARLY: "recurring.unit.year",
  };
  const unitKeyName = unitKey[frequency] ?? "recurring.unit.day";
  return interval === 1
    ? t("recurring.every", { unit: t(unitKeyName) })
    : t("recurring.everyN", { n: interval, unit: t(unitKeyName) });
}

export default async function RecurringPage() {
  const ctx = await requireHousehold();
  const t = await getT();
  const locale = await getLocale();

  const [accounts, categories, rules] = await Promise.all([
    prisma.account.findMany({
      where: { householdId: ctx.householdId, isArchived: false },
      select: { id: true, name: true, currency: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({
      where: { householdId: ctx.householdId, isArchived: false },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.recurringTransaction.findMany({
      where: { householdId: ctx.householdId },
      include: { account: true, category: true, transferAccount: true },
      orderBy: [{ isActive: "desc" }, { nextRunDate: "asc" }],
    }),
  ]);

  return (
    <>
      <Topbar
        title={t("recurring.title")}
        subtitle={t("recurring.subtitle")}
        action={
          accounts.length > 0 ? (
            <div className="flex items-center gap-3">
              <RunRecurringButton />
              <Modal
                title={t("recurring.new")}
                trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}
              >
                <RecurringForm accounts={accounts} categories={categories} />
              </Modal>
            </div>
          ) : null
        }
      />

      {accounts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-500 mb-2">{t("recurring.needAccount")}</p>
          <a href="/accounts" className="text-brand-600 font-medium hover:underline">{t("recurring.createAccount")}</a>
        </div>
      ) : rules.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          {t("recurring.empty")}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="surface-subtle text-[var(--muted)] text-start">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("recurring.colDescription")}</th>
                  <th className="px-4 py-3 font-medium">{t("recurring.colSchedule")}</th>
                  <th className="px-4 py-3 font-medium">{t("recurring.colNextRun")}</th>
                  <th className="px-4 py-3 font-medium text-end">{t("recurring.colAmount")}</th>
                  <th className="px-4 py-3 font-medium">{t("recurring.colStatus")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)] row-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {r.description || <span className="text-slate-400">{t("recurring.untitled")}</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        {r.type === "TRANSFER"
                          ? t("recurring.transferDesc", { from: r.account.name, to: r.transferAccount?.name ?? "?" })
                          : t("recurring.typeDesc", {
                              type: t("enum.txnType." + r.type),
                              category: r.category?.name ?? t("recurring.uncategorized"),
                              account: r.account.name,
                            })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {cadence(t, r.interval, r.frequency)}
                      {r.endDate && (
                        <span className="block text-xs text-slate-400">{t("recurring.until", { date: formatDate(r.endDate, locale) })}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.isActive ? formatDate(r.nextRunDate, locale) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums font-medium whitespace-nowrap">
                      {formatMoney(toNumber(r.amount), r.currency)}
                    </td>
                    <td className="px-4 py-3">
                      {r.isActive ? (
                        <span className="badge bg-green-50 text-green-700">{t("recurring.active")}</span>
                      ) : (
                        <span className="badge surface-subtle text-[var(--muted)]">{t("recurring.paused")}</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Modal
                          title={t("recurring.edit")}
                          trigger={
                            <button
                              className="btn-ghost p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                              aria-label={t("recurring.editAria")}
                              title={t("common.edit")}
                            >
                              <Pencil size={16} />
                            </button>
                          }
                        >
                          <RecurringForm
                            accounts={accounts}
                            categories={categories}
                            rule={{
                              id: r.id,
                              type: r.type,
                              accountId: r.accountId,
                              categoryId: r.categoryId,
                              transferAccountId: r.transferAccountId,
                              amount: toNumber(r.amount),
                              currency: r.currency,
                              description: r.description,
                              frequency: r.frequency,
                              interval: r.interval,
                              startDate: r.startDate.toISOString().slice(0, 10),
                              endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
                            }}
                          />
                        </Modal>
                        <RecurringToggle id={r.id} active={r.isActive} />
                        <DeleteButton action={deleteRecurring} id={r.id} label={t("recurring.deleteRule")} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
