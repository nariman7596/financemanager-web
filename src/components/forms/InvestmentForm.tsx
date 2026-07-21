"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createInvestment } from "@/app/actions/investments";
import { useCloseModal } from "@/components/Modal";
import { INVESTMENT_TYPES, CURRENCIES } from "@/lib/constants";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Saving…" : "Add holding"}
    </button>
  );
}

export function InvestmentForm({
  defaultCurrency,
}: {
  defaultCurrency: string;
}) {
  const close = useCloseModal();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function action(formData: FormData) {
    setError(null);
    const res = await createInvestment(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Symbol</label>
          <input name="symbol" required className="input" placeholder="AAPL" />
        </div>
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue="STOCK">
            {INVESTMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Name</label>
        <input name="name" required className="input" placeholder="Apple Inc." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Quantity</label>
          <input name="quantity" type="number" step="any" min="0" required className="input" placeholder="10" />
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Total cost basis</label>
          <input name="costBasis" type="number" step="0.01" min="0" required className="input" placeholder="1500.00" />
        </div>
        <div>
          <label className="label">Current price / unit</label>
          <input name="currentPrice" type="number" step="0.01" min="0" className="input" placeholder="0.00" />
        </div>
      </div>
      <div>
        <label className="label">Purchase date</label>
        <input name="purchaseDate" type="date" required defaultValue={today} className="input" />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
