"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createAccount } from "@/app/actions/accounts";
import { useCloseModal } from "@/components/Modal";
import { ACCOUNT_TYPES, CURRENCIES } from "@/lib/constants";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Saving…" : "Add account"}
    </button>
  );
}

export function AccountForm() {
  const close = useCloseModal();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await createAccount(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Name</label>
        <input name="name" required className="input" placeholder="e.g. Main Checking" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue="CHECKING">
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Currency</label>
          <select name="currency" className="input" defaultValue="USD">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Opening balance</label>
        <input name="openingBalance" type="number" step="0.01" defaultValue={0} className="input" />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
