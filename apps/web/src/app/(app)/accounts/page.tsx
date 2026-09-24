import { Plus, Landmark, Pencil, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getAccountBalances, getBaseCurrency } from "@/lib/queries";
import { formatMoney, formatDate, toNumber } from "@financemanager/core/money";
import { loanStatus } from "@financemanager/core/loans";
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
import { SettleGapButtons } from "@/components/SettleGapButtons";
import { getReconciliations } from "@/lib/reconcile";
import { loadRates, sumInCurrency } from "@/lib/currency";
import { convert } from "@financemanager/core/currency";
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const [accounts, reconciliations, heldRows, rates] = await Promise.all([
    getAccountBalances(ctx.householdId),
    getReconciliations(ctx.householdId),
    prisma.investment.findMany({
      where: { householdId: ctx.householdId, heldForId: { not: null } },
      select: { heldForId: true, symbol: true, quantity: true, costBasis: true, currentPrice: true, currency: true },
    }),
    loadRates(),
  ]);
  // Holdings kept for a person are theirs too: what they have with you is
  // their account (cash) less those holdings' value, in the account's currency.
  const held = new Map<string, { symbol: string; quantity: number; value: number; gain: number }[]>();
  for (const a of accounts.filter((x) => x.type === "PERSON")) {
    const rows = heldRows.filter((h) => h.heldForId === a.id);
    if (rows.length === 0) continue;
    held.set(
      a.id,
      rows.map((h) => {
        const quantity = toNumber(h.quantity);
        const value = quantity * toNumber(h.currentPrice);
        return {
          symbol: h.symbol,
          quantity,
          value: convert(value, h.currency, a.currency, rates),
          gain: convert(value - toNumber(h.costBasis), h.currency, a.currency, rates),
        };
      }),
    );
  }
  const heldTotal = (id: string) => (held.get(id) ?? []).reduce((s, h) => s + h.value, 0);
  const position = (a: (typeof accounts)[number]) => (a.type === "PERSON" ? a.balance - heldTotal(a.id) : a.balance);
  const canEdit = ctx.role !== "VIEWER";
  // People you settle with are not places money is kept: split them out so
  // the page tells your own money apart from money you hold for others.
  const inBase = (list: typeof accounts) =>
    sumInCurrency(list.map((a) => ({ amount: a.balance, currency: a.currency })), base);
  const people = accounts.filter((a) => a.type === "PERSON");
  // Loans are debts, not places money is kept either.
  const loans = accounts.filter((a) => a.type === "LOAN");
  const [totalInBase, inAccounts, heldForOthers, owedToMe, loanBalance] = await Promise.all([
    inBase(accounts),
    inBase(accounts.filter((a) => a.type !== "PERSON" && a.type !== "LOAN")),
    sumInCurrency(people.filter((a) => position(a) < 0).map((a) => ({ amount: position(a), currency: a.currency })), base),
    inBase(people.filter((a) => position(a) > 0).map((a) => ({ ...a, balance: position(a) }))),
    inBase(loans),
  ]);
  // The last instalment into each loan, to estimate how many are left.
  const lastPayment = new Map<string, number>();
  if (loans.length > 0) {
    const paid = await prisma.transaction.findMany({
      where: { householdId: ctx.householdId, type: "TRANSFER", transferAccountId: { in: loans.map((l) => l.id) } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { transferAccountId: true, amount: true },
    });
    for (const p of paid) {
      if (p.transferAccountId && !lastPayment.has(p.transferAccountId)) {
        lastPayment.set(p.transferAccountId, toNumber(p.amount));
      }
    }
  }

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

      <div
        className={
          "grid gap-4 mb-6 " +
          (people.length > 0 && loans.length > 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")
        }
      >
        {people.length === 0 && loans.length === 0 ? (
          <>
            <StatCard label={t("accounts.totalBalance")} value={formatMoney(totalInBase, base)} hint={t("common.inCurrency", { code: base })} />
            <StatCard label={t("accounts.count")} value={String(accounts.length)} />
          </>
        ) : (
          <>
            <StatCard label={t("accounts.ownMoney")} value={formatMoney(totalInBase, base)} hint={t("accounts.ownMoneyHint")} />
            <StatCard label={t("accounts.inAccounts")} value={formatMoney(inAccounts, base)} hint={t("accounts.inAccountsHint")} />
            {people.length > 0 && (
              <StatCard
                label={t("accounts.othersMoney")}
                value={formatMoney(-heldForOthers, base)}
                hint={owedToMe > 0 ? t("accounts.owedToMeHint", { amount: formatMoney(owedToMe, base) }) : t("accounts.othersMoneyHint")}
              />
            )}
            {loans.length > 0 && (
              <StatCard label={t("accounts.loanDebt")} value={formatMoney(Math.max(0, -loanBalance), base)} hint={t("accounts.loanDebtHint")} />
            )}
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
                  {a.type === "PERSON" || a.type === "LOAN"
                    ? formatMoney(Math.abs(position(a)), a.currency)
                    : formatMoney(a.balance, a.currency)}
                </p>
                {a.type === "LOAN" ? (
                  (() => {
                    const st = loanStatus(a.balance, lastPayment.get(a.id) ?? null);
                    return st.debt === 0 ? (
                      <p className="text-sm mt-1 text-emerald-600">{t("loan.paidOff")}</p>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-sm text-amber-700 dark:text-amber-300">{t("loan.debt")}</p>
                        {st.paymentsLeft !== null && (
                          <p className="text-xs text-slate-400">
                            {t("loan.paymentsLeft", {
                              count: st.paymentsLeft,
                              amount: formatMoney(lastPayment.get(a.id)!, a.currency),
                            })}
                          </p>
                        )}
                      </div>
                    );
                  })()
                ) : a.type === "PERSON" ? (
                  <div className="mt-1 space-y-0.5">
                    {/* Say what the number means instead of leaving a sign to decode. */}
                    <p
                      className={
                        "text-sm " +
                        (position(a) < 0
                          ? "text-amber-700 dark:text-amber-300"
                          : position(a) > 0
                            ? "text-emerald-600"
                            : "text-slate-400")
                      }
                    >
                      {position(a) < 0
                        ? t("person.holding", { name: a.name })
                        : position(a) > 0
                          ? t("person.owes", { name: a.name })
                          : t("person.settled")}
                    </p>
                    {held.has(a.id) && (
                      <>
                        {held.get(a.id)!.map((h, i) => (
                          <p key={i} className="text-xs text-slate-400 tabular-nums">
                            {/* A Latin symbol and number inside a Persian line: isolate them. */}
                            <bdi>{h.quantity} {h.symbol}</bdi>{" "}
                            {h.value > 0 ? (
                              <>
                                ≈ <bdi>{formatMoney(h.value, a.currency)}</bdi>{" "}
                                <span className={h.gain >= 0 ? "text-emerald-600" : "text-red-600"}>
                                  ({t(h.gain >= 0 ? "person.heldGain" : "person.heldLoss", { amount: formatMoney(Math.abs(h.gain), a.currency) })})
                                </span>
                              </>
                            ) : (
                              <>· {t("inv.noPrice")}</>
                            )}
                          </p>
                        ))}
                        {Math.abs(a.balance) >= 1 && (
                          <p className="text-xs text-slate-400 tabular-nums">
                            {a.balance < 0
                              ? t("person.cashHeld", { amount: formatMoney(-a.balance, a.currency) })
                              : t("person.cashOwed", { amount: formatMoney(a.balance, a.currency) })}
                          </p>
                        )}
                      </>
                    )}
                  </div>
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
                        <SettleGapButtons
                          accountId={a.id}
                          amount={formatMoney(Math.abs(r.gap), a.currency)}
                          shortfall={r.gap < 0}
                        />
                      )}
                    </div>
                  );
                })()}
                {(a.currency === "IRR" || a.currency === "IRT") && a.type !== "PERSON" && a.type !== "LOAN" && (
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
