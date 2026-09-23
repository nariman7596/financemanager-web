import { Plus, Landmark, Pencil, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getAccountBalances, getBaseCurrency } from "@/lib/queries";
import { formatMoney, formatDate } from "@financemanager/core/money";
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
import { deleteAccount, settleBalanceGap } from "@/app/actions/accounts";
import { getReconciliations } from "@/lib/reconcile";
import { sumInCurrency } from "@/lib/currency";
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const [accounts, reconciliations] = await Promise.all([
    getAccountBalances(ctx.householdId),
    getReconciliations(ctx.householdId),
  ]);
  const canEdit = ctx.role !== "VIEWER";
  // People you settle with are not places money is kept: split them out so
  // the page tells your own money apart from money you hold for others.
  const inBase = (list: typeof accounts) =>
    sumInCurrency(list.map((a) => ({ amount: a.balance, currency: a.currency })), base);
  const people = accounts.filter((a) => a.type === "PERSON");
  const [totalInBase, inAccounts, heldForOthers, owedToMe] = await Promise.all([
    inBase(accounts),
    inBase(accounts.filter((a) => a.type !== "PERSON")),
    inBase(people.filter((a) => a.balance < 0)),
    inBase(people.filter((a) => a.balance > 0)),
  ]);

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
        {people.length === 0 ? (
          <>
            <StatCard label={t("accounts.totalBalance")} value={formatMoney(totalInBase, base)} hint={t("common.inCurrency", { code: base })} />
            <StatCard label={t("accounts.count")} value={String(accounts.length)} />
          </>
        ) : (
          <>
            <StatCard label={t("accounts.ownMoney")} value={formatMoney(totalInBase, base)} hint={t("accounts.ownMoneyHint")} />
            <StatCard label={t("accounts.inAccounts")} value={formatMoney(inAccounts, base)} hint={t("accounts.inAccountsHint")} />
            <StatCard
              label={t("accounts.othersMoney")}
              value={formatMoney(-heldForOthers, base)}
              hint={owedToMe > 0 ? t("accounts.owedToMeHint", { amount: formatMoney(owedToMe, base) }) : t("accounts.othersMoneyHint")}
            />
          </>
        )}
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
                  <div className="flex items-center">
                    <Modal
                      title={t("accForm.editTitle", { name: a.name })}
                      trigger={
                        <button
                          className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]"
                          aria-label={t("accForm.edit")}
                          title={t("accForm.edit")}
                        >
                          <Pencil size={16} />
                        </button>
                      }
                    >
                      <AccountForm
                        account={{
                          id: a.id,
                          name: a.name,
                          type: a.type,
                          currency: a.currency,
                          openingBalance: a.openingBalance,
                          smsMatch: a.smsMatch,
                        }}
                      />
                    </Modal>
                    <DeleteButton action={deleteAccount} id={a.id} label={t("accounts.deleteAccount")} />
                  </div>
                </div>
                <p className="text-2xl font-semibold mt-4 tabular-nums">
                  {a.type === "PERSON" ? formatMoney(Math.abs(a.balance), a.currency) : formatMoney(a.balance, a.currency)}
                </p>
                {a.type === "PERSON" ? (
                  // Say what the number means instead of leaving a sign to decode.
                  <p
                    className={
                      "text-sm mt-1 " +
                      (a.balance < 0
                        ? "text-amber-700 dark:text-amber-300"
                        : a.balance > 0
                          ? "text-emerald-600"
                          : "text-slate-400")
                    }
                  >
                    {a.balance < 0
                      ? t("person.holding", { name: a.name })
                      : a.balance > 0
                        ? t("person.owes", { name: a.name })
                        : t("person.settled")}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    {t("accounts.opening", { amount: formatMoney(a.openingBalance, a.currency) })}
                  </p>
                )}
                {(() => {
                  const r = reconciliations.get(a.id);
                  if (!r) return null;
                  if (r.gap === 0) {
                    return (
                      <p className="flex items-center gap-1 text-xs text-emerald-600 mt-2">
                        <CheckCircle2 size={13} /> {t("reconcile.matches", { date: formatDate(r.date, locale) })}
                      </p>
                    );
                  }
                  return (
                    <div className="mt-3 rounded-lg px-3 py-2 text-xs bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 space-y-1.5">
                      <p className="flex items-center gap-1 font-medium">
                        <AlertTriangle size={13} /> {t("reconcile.gap", { amount: formatMoney(Math.abs(r.gap), a.currency) })}
                      </p>
                      <p>
                        {t("reconcile.detail", {
                          date: formatDate(r.date, locale),
                          bank: formatMoney(r.bankBalance, a.currency),
                          app: formatMoney(r.appBalance, a.currency),
                        })}
                      </p>
                      {canEdit && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <form action={settleBalanceGap}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="mode" value="transaction" />
                            <button type="submit" className="btn-ghost border border-amber-300 text-xs px-2 py-1">
                              {r.gap < 0 ? t("reconcile.bookExpense") : t("reconcile.bookIncome")}
                            </button>
                          </form>
                          <form action={settleBalanceGap}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="mode" value="opening" />
                            <button type="submit" className="btn-ghost border border-amber-300 text-xs px-2 py-1">
                              {t("reconcile.fixOpening")}
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {(a.currency === "IRR" || a.currency === "IRT") && a.type !== "PERSON" && (
                  <p className="text-xs text-slate-400 mt-1">
                    {a.smsMatch ? t("sms.matchSet", { number: a.smsMatch }) : t("sms.matchUnset")}
                  </p>
                )}
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
