import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAccountBalances, getBaseCurrency } from "@/lib/queries";
import { formatMoney } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { StatCard } from "@/components/StatCard";
import { AccountForm } from "@/components/forms/AccountForm";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteAccount } from "@/app/actions/accounts";
import { sumInCurrency } from "@/lib/currency";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  INVESTMENT: "Investment",
  OTHER: "Other",
};

export default async function AccountsPage() {
  const user = await requireUser();
  const base = await getBaseCurrency(user.userId);
  const accounts = await getAccountBalances(user.userId);
  const totalInBase = await sumInCurrency(
    accounts.map((a) => ({ amount: a.balance, currency: a.currency })),
    base,
  );

  return (
    <>
      <Topbar
        title="Accounts"
        subtitle="Where your money lives"
        action={
          <Modal
            title="New account"
            trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
          >
            <AccountForm />
          </Modal>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total balance" value={formatMoney(totalInBase, base)} hint={`in ${base}`} />
        <StatCard label="Accounts" value={String(accounts.length)} />
      </div>

      {accounts.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No accounts yet. Add your first account to start tracking.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-slate-400">{TYPE_LABEL[a.type] ?? a.type} · {a.currency}</p>
                </div>
                <DeleteButton action={deleteAccount} id={a.id} label="Delete account" />
              </div>
              <p className="text-2xl font-semibold mt-4 tabular-nums">
                {formatMoney(a.balance, a.currency)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Opening: {formatMoney(a.openingBalance, a.currency)}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
