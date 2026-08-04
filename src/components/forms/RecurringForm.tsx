"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createRecurring, updateRecurring } from "@/app/actions/recurring";
import { useCloseModal } from "@/components/Modal";
import { TRANSACTION_TYPES, RECURRENCES, CURRENCIES } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; type: string };

// Serializable shape passed from the (server) page when editing a rule.
export type EditableRecurring = {
  id: string;
  type: string;
  accountId: string;
  categoryId: string | null;
  transferAccountId: string | null;
  amount: number;
  currency: string;
  description: string | null;
  frequency: string;
  interval: number;
  startDate: string; // yyyy-mm-dd
  endDate: string | null; // yyyy-mm-dd
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : label}
    </button>
  );
}

export function RecurringForm({
  accounts,
  categories,
  rule,
}: {
  accounts: Account[];
  categories: Category[];
  rule?: EditableRecurring;
}) {
  const isEdit = !!rule;
  const t = useT();
  const close = useCloseModal();
  const [type, setType] = useState<string>(rule?.type ?? "EXPENSE");
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const relevantCategories = categories.filter((c) =>
    type === "INCOME" ? c.type === "INCOME" : c.type === "EXPENSE",
  );

  async function action(formData: FormData) {
    setError(null);
    const res = isEdit ? await updateRecurring(formData) : await createRecurring(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={rule.id} />}
      <div className="grid grid-cols-3 gap-2">
        {TRANSACTION_TYPES.map((val) => (
          <label
            key={val}
            className={`cursor-pointer text-center text-sm rounded-lg border px-2 py-2 capitalize ${
              type === val ? "border-brand-500 bg-brand-50 text-brand-700 font-medium" : "border-[var(--border)]"
            }`}
          >
            <input type="radio" name="type" value={val} className="sr-only" checked={type === val} onChange={() => setType(val)} />
            {t("enum.txnType." + val)}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("txnForm.amount")}</label>
          <input name="amount" type="number" step="0.01" min="0" required className="input" placeholder="0.00" defaultValue={rule?.amount} />
        </div>
        <div>
          <label className="label">{t("txnForm.currency")}</label>
          <select name="currency" className="input" defaultValue={rule?.currency ?? accounts[0]?.currency ?? "USD"}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">{type === "TRANSFER" ? t("txnForm.fromAccount") : t("txnForm.account")}</label>
        <select name="accountId" required className="input" defaultValue={rule?.accountId}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </select>
      </div>

      {type === "TRANSFER" ? (
        <div>
          <label className="label">{t("txnForm.toAccount")}</label>
          <select name="transferAccountId" required className="input" defaultValue={rule?.transferAccountId ?? ""}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="label">{t("txnForm.category")}</label>
          <select name="categoryId" className="input" defaultValue={rule?.categoryId ?? ""}>
            <option value="">{t("txnForm.uncategorized")}</option>
            {relevantCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label">{t("txnForm.description")}</label>
        <input name="description" className="input" placeholder={t("recForm.descriptionPlaceholder")} defaultValue={rule?.description ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("recForm.repeatsEvery")}</label>
          <input name="interval" type="number" min="1" defaultValue={rule?.interval ?? 1} className="input" />
        </div>
        <div>
          <label className="label">{t("recForm.frequency")}</label>
          <select name="frequency" className="input" defaultValue={rule?.frequency ?? "MONTHLY"}>
            {RECURRENCES.map((opt) => (
              <option key={opt} value={opt}>{t("enum.period." + opt)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("recForm.startDate")}</label>
          <input name="startDate" type="date" required defaultValue={rule?.startDate ?? today} className="input" />
        </div>
        <div>
          <label className="label">{t("recForm.endDate")} <span className="text-slate-400">({t("common.optional")})</span></label>
          <input name="endDate" type="date" className="input" defaultValue={rule?.endDate ?? ""} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit label={isEdit ? t("recForm.saveChanges") : t("recForm.create")} />
    </form>
  );
}
