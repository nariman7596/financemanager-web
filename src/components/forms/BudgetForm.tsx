"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { upsertBudget } from "@/app/actions/budgets";
import { useCloseModal } from "@/components/Modal";
import { BUDGET_PERIODS, CURRENCIES } from "@/lib/constants";

type Category = { id: string; name: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Saving…" : "Save budget"}
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
        <label className="label">Category (expense)</label>
        <select name="categoryId" required className="input">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Limit</label>
          <input name="amount" type="number" step="0.01" min="0" required className="input" placeholder="0.00" />
        </div>
        <div>
          <label className="label">Currency</label>
          <select name="currency" className="input" defaultValue={defaultCurrency}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Period</label>
        <select name="period" className="input" defaultValue="MONTHLY">
          {BUDGET_PERIODS.map((p) => (
            <option key={p} value={p}>{p.toLowerCase()}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
