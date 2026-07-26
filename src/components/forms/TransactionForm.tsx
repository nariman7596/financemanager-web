"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createTransaction, updateTransaction } from "@/app/actions/transactions";
import { useCloseModal } from "@/components/Modal";
import { TRANSACTION_TYPES, RECURRENCES, CURRENCIES } from "@/lib/constants";

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; type: string };

// Plain, serializable shape passed from the (server) page when editing.
export type EditableTransaction = {
  id: string;
  type: string;
  accountId: string;
  categoryId: string | null;
  transferAccountId: string | null;
  amount: number;
  currency: string;
  date: string; // yyyy-mm-dd
  description: string | null;
  isRecurring: boolean;
  recurrence: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function TransactionForm({
  accounts,
  categories,
  transaction,
}: {
  accounts: Account[];
  categories: Category[];
  transaction?: EditableTransaction;
}) {
  const isEdit = !!transaction;
  const close = useCloseModal();
  const [type, setType] = useState<string>(transaction?.type ?? "EXPENSE");
  const [error, setError] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(transaction?.isRecurring ?? false);

  const today = new Date().toISOString().slice(0, 10);
  const relevantCategories = categories.filter((c) =>
    type === "INCOME" ? c.type === "INCOME" : c.type === "EXPENSE",
  );

  async function action(formData: FormData) {
    setError(null);
    const res = isEdit
      ? await updateTransaction(formData)
      : await createTransaction(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={transaction.id} />}

      <div className="grid grid-cols-3 gap-2">
        {TRANSACTION_TYPES.map((t) => (
          <label
            key={t}
            className={`cursor-pointer text-center text-sm rounded-lg border px-2 py-2 capitalize ${
              type === t ? "border-brand-500 bg-brand-50 text-brand-700 font-medium" : "border-[var(--border)]"
            }`}
          >
            <input type="radio" name="type" value={t} className="sr-only" checked={type === t} onChange={() => setType(t)} />
            {t.toLowerCase()}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount</label>
          <input name="amount" type="number" step="0.01" min="0" required className="input" placeholder="0.00" defaultValue={transaction?.amount} />
        </div>
        <div>
          <label className="label">Currency</label>
          <select name="currency" className="input" defaultValue={transaction?.currency ?? accounts[0]?.currency ?? "USD"}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">{type === "TRANSFER" ? "From account" : "Account"}</label>
        <select name="accountId" required className="input" defaultValue={transaction?.accountId}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </select>
      </div>

      {type === "TRANSFER" ? (
        <div>
          <label className="label">To account</label>
          <select name="transferAccountId" required className="input" defaultValue={transaction?.transferAccountId ?? ""}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="label">Category</label>
          <select name="categoryId" className="input" defaultValue={transaction?.categoryId ?? ""}>
            <option value="">Uncategorized</option>
            {relevantCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" required defaultValue={transaction?.date ?? today} className="input" />
        </div>
        <div>
          <label className="label">Description</label>
          <input name="description" className="input" placeholder="Optional" defaultValue={transaction?.description ?? ""} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isRecurring" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        Recurring
      </label>
      {recurring && (
        <select name="recurrence" className="input" defaultValue={transaction?.recurrence ?? "MONTHLY"}>
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>{r.toLowerCase()}</option>
          ))}
        </select>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit label={isEdit ? "Save changes" : "Add transaction"} />
    </form>
  );
}
