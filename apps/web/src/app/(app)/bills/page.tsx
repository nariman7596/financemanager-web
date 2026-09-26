import { Plus, Pencil, CalendarClock } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getBaseCurrency } from "@/lib/queries";
import { getBills } from "@/lib/bills";
import { billStatusText, BILL_STATE_CLASS } from "@/lib/billText";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { DeleteButton } from "@/components/DeleteButton";
import { BillForm } from "@/components/forms/BillForm";
import { PauseBillButton, SuggestionActions } from "@/components/BillActions";
import { deleteBill } from "@/app/actions/bills";
import { formatMoney } from "@financemanager/core/money";
import { getT, getLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const { bills, suggestions, loans, categories, names } = await getBills(ctx.householdId, base, locale);
  const active = bills.filter((b) => b.active).sort((a, b) => a.status.due.getTime() - b.status.due.getTime());
  const paused = bills.filter((b) => !b.active);

  const matchText = (b: { matchKind: string; matchValue: string }) =>
    b.matchKind === "LOAN"
      ? t("bills.byLoan", { name: names.loans.get(b.matchValue) ?? "?" })
      : b.matchKind === "CATEGORY"
        ? t("bills.byCategory", { name: names.categories.get(b.matchValue) ?? "?" })
        : t("bills.byText", { text: b.matchValue });

  const form = (bill?: Parameters<typeof BillForm>[0]["bill"]) => (
    <BillForm bill={bill} defaultCurrency={base} loans={loans} categories={categories} />
  );

  return (
    <>
      <Topbar
        title={t("bills.title")}
        subtitle={t("bills.subtitle")}
        action={
          <Modal title={t("bills.new")} trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}>
            {form()}
          </Modal>
        }
      />

      {suggestions.length > 0 && (
        <div className="card p-4 mb-6">
          <h2 className="text-sm font-semibold mb-1">{t("bills.suggestTitle")}</h2>
          <p className="text-xs text-slate-400 mb-3">{t("bills.suggestHint")}</p>
          <ul className="divide-y divide-[var(--border)]">
            {suggestions.map((s) => (
              <li key={`${s.match.kind}:${s.match.value}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium"><bdi>{s.name}</bdi></p>
                  <p className="text-xs text-slate-400">
                    {t("bills.suggestLine", { amount: formatMoney(s.amount, base), day: s.dueDay, count: s.count })}
                  </p>
                </div>
                <div className="ms-auto">
                  <SuggestionActions
                    suggestion={{ name: s.name, amount: s.amount, currency: base, dueDay: s.dueDay, matchKind: s.match.kind, matchValue: s.match.value }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {active.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <CalendarClock className="mx-auto mb-2" />
          {t("bills.empty")}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--border)]">
          {active.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium"><bdi>{b.name}</bdi></p>
                <p className="text-xs text-slate-400">
                  {t("bills.everyMonth", { day: b.dueDay })} · <bdi>{matchText(b)}</bdi>
                </p>
              </div>
              <div className="ms-auto text-end">
                <p className="tabular-nums font-medium">{formatMoney(b.amount, b.currency)}</p>
                <p className={cn("text-xs", BILL_STATE_CLASS[b.status.state])}>{billStatusText(t, b.status, locale)}</p>
              </div>
              <div className="flex items-center whitespace-nowrap">
                <Modal
                  title={t("bills.edit", { name: b.name })}
                  trigger={
                    <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" aria-label={t("bills.edit", { name: b.name })}>
                      <Pencil size={16} />
                    </button>
                  }
                >
                  {form({ id: b.id, name: b.name, amount: b.amount, currency: b.currency, dueDay: b.dueDay, leadDays: b.leadDays, matchKind: b.matchKind, matchValue: b.matchValue })}
                </Modal>
                <PauseBillButton id={b.id} active />
                <DeleteButton action={deleteBill} id={b.id} label={t("bills.delete")} />
              </div>
            </div>
          ))}
        </div>
      )}

      {paused.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2 text-slate-400">{t("bills.paused")}</h2>
          <div className="card divide-y divide-[var(--border)]">
            {paused.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-4 p-3 text-sm text-slate-400">
                <bdi>{b.name}</bdi>
                <span className="text-xs">{t("bills.everyMonth", { day: b.dueDay })}</span>
                <span className="ms-auto tabular-nums">{formatMoney(b.amount, b.currency)}</span>
                <PauseBillButton id={b.id} active={false} />
                <DeleteButton action={deleteBill} id={b.id} label={t("bills.delete")} />
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-4">{t("bills.howPaid")}</p>
    </>
  );
}
