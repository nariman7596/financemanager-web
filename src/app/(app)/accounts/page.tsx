import { Plus, Landmark } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getAccountBalances, getBaseCurrency } from "@/lib/queries";
import { formatMoney, formatDate } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { plaidConfigured } from "@/lib/plaid";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { StatCard } from "@/components/StatCard";
import { AccountForm } from "@/components/forms/AccountForm";
import { DeleteButton } from "@/components/DeleteButton";
import { UnlinkAccountButton } from "@/components/UnlinkAccountButton";
import { PlaidLinkButton } from "@/components/PlaidLinkButton";
import { BankSyncButton } from "@/components/BankSyncButton";
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
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const accounts = await getAccountBalances(ctx.householdId);
  const totalInBase = await sumInCurrency(
    accounts.map((a) => ({ amount: a.balance, currency: a.currency })),
    base,
  );

  const bankSyncEnabled = plaidConfigured();
  const plaidItems = bankSyncEnabled
    ? await prisma.plaidItem.findMany({
        where: { householdId: ctx.householdId },
        select: { id: true, institutionName: true, lastSyncedAt: true, status: true, error: true },
      })
    : [];
  const itemById = new Map(plaidItems.map((i) => [i.id, i]));
  const unlinkedAccounts = accounts
    .filter((a) => a.source === "MANUAL")
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  return (
    <>
      <Topbar
        title="Accounts"
        subtitle="Where your money lives"
        action={
          <div className="flex items-center gap-3">
            {bankSyncEnabled && plaidItems.length > 0 && <BankSyncButton />}
            {bankSyncEnabled && (
              <Modal
                title="Connect a bank"
                trigger={
                  <button className="btn-ghost border border-[var(--border)]">
                    <Landmark size={18} /> Connect a bank
                  </button>
                }
              >
                <PlaidLinkButton unlinkedAccounts={unlinkedAccounts} />
              </Modal>
            )}
            <Modal
              title="New account"
              trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
            >
              <AccountForm />
            </Modal>
          </div>
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
          {accounts.map((a) => {
            const linked = a.source === "PLAID" && a.plaidItemId ? itemById.get(a.plaidItemId) : null;
            return (
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
                <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2">
                  {linked ? (
                    <>
                      <span className="badge surface-subtle text-[var(--muted)] text-[11px]">
                        via Plaid · {linked.institutionName ?? "bank"}
                        {linked.status === "ERROR" && " · sync error"}
                        {linked.lastSyncedAt && ` · synced ${formatDate(linked.lastSyncedAt)}`}
                      </span>
                      <UnlinkAccountButton id={a.id} />
                    </>
                  ) : bankSyncEnabled ? (
                    <Modal
                      title={`Link "${a.name}" to a bank`}
                      trigger={
                        <button className="text-xs text-brand-600 hover:underline underline-offset-2">
                          Link to bank
                        </button>
                      }
                    >
                      <PlaidLinkButton
                        unlinkedAccounts={unlinkedAccounts}
                        presetAccountId={a.id}
                        label={`Connect "${a.name}"`}
                      />
                    </Modal>
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
