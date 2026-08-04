"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createTransaction, updateTransaction } from "@/app/actions/transactions";
import { useCloseModal } from "@/components/Modal";
import Link from "next/link";
import { TRANSACTION_TYPES, CURRENCIES } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

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
  const t = useT();
  const close = useCloseModal();
  const [type, setType] = useState<string>(transaction?.type ?? "EXPENSE");
  const [error, setError] = useState<string | null>(null);

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
        {TRANSACTION_TYPES.map((t2) => (
          <label
            key={t2}
            className={`cursor-pointer text-center text-sm rounded-lg border px-2 py-2 capitalize ${
              type === t2 ? "border-brand-500 bg-brand-50 text-brand-700 font-medium" : "border-[var(--border)]"
            }`}
          >
            <input type="radio" name="type" value={t2} className="sr-only" checked={type === t2} onChange={() => setType(t2)} />
            {t("enum.txnType." + t2)}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("txnForm.amount")}</label>
          <input name="amount" type="number" step="0.01" min="0" required className="input" placeholder="0.00" defaultValue={transaction?.amount} />
        </div>
        <div>
          <label className="label">{t("txnForm.currency")}</label>
          <select name="currency" className="input" defaultValue={transaction?.currency ?? accounts[0]?.currency ?? "USD"}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">{type === "TRANSFER" ? t("txnForm.fromAccount") : t("txnForm.account")}</label>
        <select name="accountId" required className="input" defaultValue={transaction?.accountId}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </select>
      </div>

      {type === "TRANSFER" ? (
        <div>
          <label className="label">{t("txnForm.toAccount")}</label>
          <select name="transferAccountId" required className="input" defaultValue={transaction?.transferAccountId ?? ""}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="label">{t("txnForm.category")}</label>
          <select name="categoryId" className="input" defaultValue={transaction?.categoryId ?? ""}>
            <option value="">{t("txnForm.uncategorized")}</option>
            {relevantCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("txnForm.date")}</label>
          <input name="date" type="date" required defaultValue={transaction?.date ?? today} className="input" />
        </div>
        <div>
          <label className="label">{t("txnForm.description")}</label>
          <input name="description" className="input" placeholder={t("txnForm.descriptionPlaceholder")} defaultValue={transaction?.description ?? ""} />
        </div>
      </div>

      {!isEdit && (
        <p className="text-xs text-slate-400">
          {t("txnForm.repeatsHint")}{" "}
          <Link href="/recurring" className="text-brand-600 hover:underline">
            {t("txnForm.setupRecurring")}
          </Link>{" "}
          {t("txnForm.setupRecurringSuffix")}
        </p>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit label={isEdit ? t("txnForm.saveChanges") : t("txnForm.addTransaction")} />
    </form>
  );
}
