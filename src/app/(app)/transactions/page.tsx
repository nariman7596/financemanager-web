import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, toNumber } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteTransaction } from "@/app/actions/transactions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const user = await requireUser();

  const [accounts, categories, transactions] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.userId, isArchived: false },
      select: { id: true, name: true, currency: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({
      where: { userId: user.userId, isArchived: false },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.userId },
      include: { account: true, category: true, transferAccount: true },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  return (
    <>
      <Topbar
        title="Transactions"
        subtitle={`${transactions.length} most recent`}
        action={
          accounts.length > 0 ? (
            <Modal
              title="New transaction"
              trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
            >
              <TransactionForm accounts={accounts} categories={categories} />
            </Modal>
          ) : null
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
            <thead className="bg-slate-50 text-slate-500 text-left">
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
                  <tr key={t.id} className="border-t border-[var(--border)] hover:bg-slate-50/60">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      {t.description || <span className="text-slate-400">—</span>}
                      {t.type === "TRANSFER" && t.transferAccount && (
                        <span className="text-slate-400"> → {t.transferAccount.name}</span>
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
                    <td className="px-2 py-3 text-right">
                      <DeleteButton action={deleteTransaction} id={t.id} />
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
