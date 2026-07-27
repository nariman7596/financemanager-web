import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, toNumber } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { RecurringForm } from "@/components/forms/RecurringForm";
import { RunRecurringButton } from "@/components/RunRecurringButton";
import { RecurringToggle } from "@/components/RecurringToggle";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteRecurring } from "@/app/actions/recurring";

export const dynamic = "force-dynamic";

function cadence(interval: number, frequency: string) {
  const unit = frequency.toLowerCase().replace(/ly$/, (m) =>
    frequency === "DAILY" ? "day" : m,
  );
  const label: Record<string, string> = {
    DAILY: "day",
    WEEKLY: "week",
    MONTHLY: "month",
    YEARLY: "year",
  };
  const u = label[frequency] ?? unit;
  return interval === 1 ? `every ${u}` : `every ${interval} ${u}s`;
}

export default async function RecurringPage() {
  const user = await requireUser();

  const [accounts, categories, rules] = await Promise.all([
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
    prisma.recurringTransaction.findMany({
      where: { userId: user.userId },
      include: { account: true, category: true, transferAccount: true },
      orderBy: [{ isActive: "desc" }, { nextRunDate: "asc" }],
    }),
  ]);

  return (
    <>
      <Topbar
        title="Recurring"
        subtitle="Rules that auto-post transactions on schedule"
        action={
          accounts.length > 0 ? (
            <div className="flex items-center gap-3">
              <RunRecurringButton />
              <Modal
                title="New recurring rule"
                trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
              >
                <RecurringForm accounts={accounts} categories={categories} />
              </Modal>
            </div>
          ) : null
        }
      />

      {accounts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-500 mb-2">You need an account first.</p>
          <a href="/accounts" className="text-brand-600 font-medium hover:underline">Create an account →</a>
        </div>
      ) : rules.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No recurring rules yet. Add salary, rent, subscriptions and they’ll post automatically.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="surface-subtle text-[var(--muted)] text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                <th className="px-4 py-3 font-medium">Next run</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)] row-hover">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {r.description || <span className="text-slate-400">Untitled</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.type === "TRANSFER"
                        ? `Transfer · ${r.account.name} → ${r.transferAccount?.name ?? "?"}`
                        : `${r.type.toLowerCase()} · ${r.category?.name ?? "Uncategorized"} · ${r.account.name}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 capitalize">
                    {cadence(r.interval, r.frequency)}
                    {r.endDate && (
                      <span className="block text-xs text-slate-400">until {formatDate(r.endDate)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {r.isActive ? formatDate(r.nextRunDate) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap">
                    {formatMoney(toNumber(r.amount), r.currency)}
                  </td>
                  <td className="px-4 py-3">
                    {r.isActive ? (
                      <span className="badge bg-green-50 text-green-700">Active</span>
                    ) : (
                      <span className="badge surface-subtle text-[var(--muted)]">Paused</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <RecurringToggle id={r.id} active={r.isActive} />
                      <DeleteButton action={deleteRecurring} id={r.id} label="Delete rule" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
