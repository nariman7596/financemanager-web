"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveBill } from "@/app/actions/bills";
import { useCloseModal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";
import { CURRENCIES } from "@financemanager/core/constants";

export type EditableBill = {
  id?: string;
  name: string;
  amount: number;
  currency: string;
  dueDay: number;
  leadDays: number;
  matchKind: string;
  matchValue: string;
};

/**
 * Add or edit a bill: what it is called, about how much, the day of the month
 * it is due, how early to remind, and how its payment is recognised — a
 * transfer into a loan, an SMS description, or a category.
 */
export function BillForm({
  bill,
  defaultCurrency,
  loans,
  categories,
}: {
  bill?: EditableBill;
  defaultCurrency: string;
  loans: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const t = useT();
  const close = useCloseModal();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState(bill?.matchKind ?? (loans.length ? "LOAN" : "DESCRIPTION"));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await saveBill(fd);
      if (res?.error) setError(res.error);
      else {
        close();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {bill?.id && <input type="hidden" name="id" value={bill.id} />}
      <div>
        <label className="label">{t("bills.name")}</label>
        <input name="name" required className="input" placeholder={t("bills.namePlaceholder")} defaultValue={bill?.name} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("bills.amount")}</label>
          <input name="amount" type="number" min="0" step="any" required className="input" defaultValue={bill?.amount} />
        </div>
        <div>
          <label className="label">{t("invForm.currency")}</label>
          <select name="currency" className="input" defaultValue={bill?.currency ?? defaultCurrency}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("bills.dueDay")}</label>
          <select name="dueDay" className="input" defaultValue={bill?.dueDay ?? 1}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("bills.leadDays")}</label>
          <select name="leadDays" className="input" defaultValue={bill?.leadDays ?? 3}>
            {[0, 1, 2, 3, 5, 7, 10].map((d) => (
              <option key={d} value={d}>{t("bills.daysBefore", { days: d })}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">{t("bills.matchKind")}</label>
        <select name="matchKind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {loans.length > 0 && <option value="LOAN">{t("bills.match.LOAN")}</option>}
          <option value="DESCRIPTION">{t("bills.match.DESCRIPTION")}</option>
          <option value="CATEGORY">{t("bills.match.CATEGORY")}</option>
        </select>
      </div>
      {kind === "LOAN" && (
        <select name="match_LOAN" className="input" defaultValue={bill?.matchKind === "LOAN" ? bill.matchValue : loans[0]?.id}>
          {loans.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}
      {kind === "DESCRIPTION" && (
        <div>
          <input name="match_DESCRIPTION" className="input" placeholder={t("bills.descriptionPlaceholder")} defaultValue={bill?.matchKind === "DESCRIPTION" ? bill.matchValue : ""} />
          <p className="text-xs text-slate-400 mt-1">{t("bills.descriptionHint")}</p>
        </div>
      )}
      {kind === "CATEGORY" && (
        <div>
          <select name="match_CATEGORY" className="input" defaultValue={bill?.matchKind === "CATEGORY" ? bill.matchValue : categories[0]?.id}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">{t("bills.categoryHint")}</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? t("common.saving") : t("common.save")}
      </button>
    </form>
  );
}
