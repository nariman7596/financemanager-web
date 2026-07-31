import { Plus, Pencil, Download, Upload } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, toNumber } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { ImportForm } from "@/components/forms/ImportForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteTransaction } from "@/app/actions/transactions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const ctx = await requireHousehold();

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
        title="Transactions"
        subtitle={`${transactions.length} most recent`}
        action={
          <div className="flex items-center gap-2">
            {transactions.length > 0 && (
              <a
                href="/api/export/transactions"
                className="btn-ghost border border-[var(--border)]"
                title="Export all transactions as CSV"
              >
                <Download size={16} /> Export
              </a>
            )}
            <Modal
              title="Import transactions"
              trigger={
                <button className="btn-ghost border border-[var(--border)]">
                  <Upload size={16} /> Import
                </button>
              }
            >
              <ImportForm />
            </Modal>
            {accounts.length > 0 && (
              <Modal
                title="New transaction"
                trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
              >
                <TransactionForm accounts={accounts} categories={categories} />
              </Modal>
            )}
          </div>
        }
      />

      {accounts.length === 0 ? (
        <EmptyNoAccounts />
      ) : transactions.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No transactions yet. Add your first one.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="surface-subtle text-[var(--muted)] text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const amt = toNumber(t.amount);
                const sign = t.type === "INCOME" ? "+" : t.type === "EXPENSE" ? "−" : "";
                return (
                  <tr key={t.id} className="border-t border-[var(--border)] row-hover">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      {t.description || <span className="text-slate-400">—</span>}
                      {t.type === "TRANSFER" && t.transferAccount && (
                        <span className="text-slate-400"> → {t.transferAccount.name}</span>
                      )}
                      {shared && t.createdById && memberName.has(t.createdById) && (
                        <span className="block text-xs text-slate-400">by {memberName.get(t.createdById)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.category ? (
                        <span className="badge" style={{ backgroundColor: `${t.category.color}1a`, color: t.category.color }}>
                          {t.category.name}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t.type === "TRANSFER" ? "Transfer" : "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{t.account.name}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap",
                        t.type === "INCOME" && "text-green-600",
                        t.type === "EXPENSE" && "text-red-600",
                      )}
                    >
                      {sign} {formatMoney(amt, t.currency)}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Modal
                          title="Edit transaction"
                          trigger={
                            <button
                              className="btn-ghost p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                              aria-label="Edit transaction"
                              title="Edit"
                            >
                              <Pencil size={16} />
                            </button>
                          }
                        >
                          <TransactionForm
                            accounts={accounts}
                            categories={categories}
                            transaction={{
                              id: t.id,
                              type: t.type,
                              accountId: t.accountId,
                              categoryId: t.categoryId,
                              transferAccountId: t.transferAccountId,
                              amount: toNumber(t.amount),
                              currency: t.currency,
                              date: t.date.toISOString().slice(0, 10),
                              description: t.description,
                            }}
                          />
                        </Modal>
                        <DeleteButton action={deleteTransaction} id={t.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function EmptyNoAccounts() {
  return (
    <div className="card p-10 text-center">
      <p className="text-slate-500 mb-2">You need an account before adding transactions.</p>
      <a href="/accounts" className="text-brand-600 font-medium hover:underline">
        Create an account →
      </a>
    </div>
  );
}
