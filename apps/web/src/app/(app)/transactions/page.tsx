import { Plus, Pencil, Download, Upload } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, toNumber } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { ImportForm } from "@/components/forms/ImportForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteTransaction } from "@/app/actions/transactions";
import { cn } from "@/lib/utils";
import { getT, getLocale } from "@/lib/i18n/server";
import type { TFunc } from "@financemanager/i18n/translate";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const ctx = await requireHousehold();
  const t = await getT();
  const locale = await getLocale();

  const [accounts, categories, transactions] = await Promise.all([
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
    prisma.transaction.findMany({
      where: { householdId: ctx.householdId },
      include: { account: true, category: true, transferAccount: true },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  // Map createdById -> member name, to show "who added it" in shared households.
  const members = await prisma.membership.findMany({
    where: { householdId: ctx.householdId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const memberName = new Map(members.map((m) => [m.userId, m.user.name ?? m.user.email]));
  const shared = members.length > 1;

  return (
    <>
      <Topbar
        title={t("txn.title")}
        subtitle={t("txn.subtitle", { count: transactions.length })}
        action={
          <div className="flex items-center gap-2">
            {transactions.length > 0 && (
              <a
                href="/api/export/transactions"
                className="btn-ghost border border-[var(--border)]"
                title={t("txn.exportTitle")}
              >
                <Download size={16} /> {t("txn.export")}
              </a>
            )}
            <Modal
              title={t("txn.importTitle")}
              trigger={
                <button className="btn-ghost border border-[var(--border)]">
                  <Upload size={16} /> {t("txn.import")}
                </button>
              }
            >
              <ImportForm />
            </Modal>
            {accounts.length > 0 && (
              <Modal
                title={t("txn.new")}
                trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}
              >
                <TransactionForm accounts={accounts} categories={categories} />
              </Modal>
            )}
          </div>
        }
      />

      {accounts.length === 0 ? (
        <EmptyNoAccounts t={t} />
      ) : transactions.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          {t("txn.empty")}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="surface-subtle text-[var(--muted)] text-start">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("txn.colDate")}</th>
                  <th className="px-4 py-3 font-medium">{t("txn.colDescription")}</th>
                  <th className="px-4 py-3 font-medium">{t("txn.colCategory")}</th>
                  <th className="px-4 py-3 font-medium">{t("txn.colAccount")}</th>
                  <th className="px-4 py-3 font-medium text-end">{t("txn.colAmount")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => {
                  const amt = toNumber(txn.amount);
                  const sign = txn.type === "INCOME" ? "+" : txn.type === "EXPENSE" ? "−" : "";
                  return (
                    <tr key={txn.id} className="border-t border-[var(--border)] row-hover">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(txn.date, locale)}</td>
                      <td className="px-4 py-3">
                        {txn.description || <span className="text-slate-400">—</span>}
                        {txn.type === "TRANSFER" && txn.transferAccount && (
                          <span className="text-slate-400"> → {txn.transferAccount.name}</span>
                        )}
                        {shared && txn.createdById && memberName.has(txn.createdById) && (
                          <span className="block text-xs text-slate-400">{t("txn.by", { name: memberName.get(txn.createdById)! })}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {txn.category ? (
                          <span className="badge" style={{ backgroundColor: `${txn.category.color}1a`, color: txn.category.color }}>
                            {txn.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">{txn.type === "TRANSFER" ? t("txn.transfer") : "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{txn.account.name}</td>
                      <td
                        className={cn(
                          "px-4 py-3 text-end tabular-nums font-medium whitespace-nowrap",
                          txn.type === "INCOME" && "text-green-600",
                          txn.type === "EXPENSE" && "text-red-600",
                        )}
                      >
                        {sign} {formatMoney(amt, txn.currency)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <Modal
                            title={t("txn.edit")}
                            trigger={
                              <button
                                className="btn-ghost p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                                aria-label={t("txn.editAria")}
                                title={t("common.edit")}
                              >
                                <Pencil size={16} />
                              </button>
                            }
                          >
                            <TransactionForm
                              accounts={accounts}
                              categories={categories}
                              transaction={{
                                id: txn.id,
                                type: txn.type,
                                accountId: txn.accountId,
                                categoryId: txn.categoryId,
                                transferAccountId: txn.transferAccountId,
                                amount: toNumber(txn.amount),
                                currency: txn.currency,
                                date: txn.date.toISOString().slice(0, 10),
                                description: txn.description,
                              }}
                            />
                          </Modal>
                          <DeleteButton action={deleteTransaction} id={txn.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyNoAccounts({ t }: { t: TFunc }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-slate-500 mb-2">{t("txn.needAccountTitle")}</p>
      <a href="/accounts" className="text-brand-600 font-medium hover:underline">
        {t("txn.createAccount")}
      </a>
    </div>
  );
}
