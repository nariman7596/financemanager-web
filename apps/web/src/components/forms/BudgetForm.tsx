"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { upsertBudget } from "@/app/actions/budgets";
import { useCloseModal } from "@/components/Modal";
import { BUDGET_PERIODS, CURRENCIES } from "@financemanager/core/constants";
import { useT } from "@/lib/i18n/client";

type Category = { id: string; name: string };

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : t("budgetForm.save")}
    </button>
  );
}

export function BudgetForm({
  categories,
  defaultCurrency,
}: {
  categories: Category[];
  defaultCurrency: string;
}) {
  const close = useCloseModal();
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await upsertBudget(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">{t("budgetForm.category")}</label>
        <select name="categoryId" required className="input">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("budgetForm.limit")}</label>
          <input name="amount" type="number" step="0.01" min="0" required className="input" placeholder="0.00" />
        </div>
        <div>
          <label className="label">{t("budgetForm.currency")}</label>
          <select name="currency" className="input" defaultValue={defaultCurrency}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">{t("budgetForm.period")}</label>
        <select name="period" className="input" defaultValue="MONTHLY">
          {BUDGET_PERIODS.map((p) => (
            <option key={p} value={p}>{t("enum.period." + p)}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
