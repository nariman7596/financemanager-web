import { Plus, Landmark } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getAccountBalances, getBaseCurrency } from "@/lib/queries";
import { formatMoney, formatDate } from "@financemanager/core/money";
import { prisma } from "@financemanager/db";
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
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const t = await getT();
  const locale = await getLocale();
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
        title={t("accounts.title")}
        subtitle={t("accounts.subtitle")}
        action={
          <div className="flex items-center gap-3">
            {bankSyncEnabled && plaidItems.length > 0 && <BankSyncButton />}
            {bankSyncEnabled && (
              <Modal
                title={t("accounts.connectBank")}
                trigger={
                  <button className="btn-ghost border border-[var(--border)]">
                    <Landmark size={18} /> {t("accounts.connectBank")}
                  </button>
                }
              >
                <PlaidLinkButton unlinkedAccounts={unlinkedAccounts} />
              </Modal>
            )}
            <Modal
              title={t("accounts.new")}
              trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}
            >
              <AccountForm />
            </Modal>
          </div>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={t("accounts.totalBalance")} value={formatMoney(totalInBase, base)} hint={t("common.inCurrency", { code: base })} />
        <StatCard label={t("accounts.count")} value={String(accounts.length)} />
      </div>

      {accounts.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          {t("accounts.empty")}
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
                    <p className="text-xs text-slate-400">{t("enum.accountType." + a.type)} · {a.currency}</p>
                  </div>
                  <DeleteButton action={deleteAccount} id={a.id} label={t("accounts.deleteAccount")} />
                </div>
                <p className="text-2xl font-semibold mt-4 tabular-nums">
                  {formatMoney(a.balance, a.currency)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t("accounts.opening", { amount: formatMoney(a.openingBalance, a.currency) })}
                </p>
                <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2">
                  {linked ? (
                    <>
                      <span className="badge surface-subtle text-[var(--muted)] text-[11px]">
                        {t("accounts.viaPlaid", { bank: linked.institutionName ?? t("accounts.bank") })}
                        {linked.status === "ERROR" && t("accounts.syncError")}
                        {linked.lastSyncedAt && t("accounts.syncedOn", { date: formatDate(linked.lastSyncedAt, locale) })}
                      </span>
                      <UnlinkAccountButton id={a.id} />
                    </>
                  ) : bankSyncEnabled ? (
                    <Modal
                      title={t("accounts.linkTitle", { name: a.name })}
                      trigger={
                        <button className="text-xs text-brand-600 hover:underline underline-offset-2">
                          {t("accounts.linkToBank")}
                        </button>
                      }
                    >
                      <PlaidLinkButton
                        unlinkedAccounts={unlinkedAccounts}
                        presetAccountId={a.id}
                        label={t("accounts.connectNamed", { name: a.name })}
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
