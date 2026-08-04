"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createInvestment } from "@/app/actions/investments";
import { useCloseModal } from "@/components/Modal";
import { INVESTMENT_TYPES, CURRENCIES } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : t("invForm.addHolding")}
    </button>
  );
}

export function InvestmentForm({
  defaultCurrency,
}: {
  defaultCurrency: string;
}) {
  const close = useCloseModal();
  const t = useT();
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
          <label className="label">{t("invForm.symbol")}</label>
          <input name="symbol" required className="input" placeholder="AAPL" />
        </div>
        <div>
          <label className="label">{t("invForm.type")}</label>
          <select name="type" className="input" defaultValue="STOCK">
            {INVESTMENT_TYPES.map((val) => (
              <option key={val} value={val}>{t("enum.invType." + val)}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">{t("invForm.name")}</label>
        <input name="name" required className="input" placeholder={t("invForm.namePlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("invForm.quantity")}</label>
          <input name="quantity" type="number" step="any" min="0" required className="input" placeholder="10" />
        </div>
        <div>
          <label className="label">{t("invForm.currency")}</label>
          <select name="currency" className="input" defaultValue={defaultCurrency}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("invForm.costBasis")}</label>
          <input name="costBasis" type="number" step="0.01" min="0" required className="input" placeholder="1500.00" />
        </div>
        <div>
          <label className="label">{t("invForm.currentPrice")}</label>
          <input name="currentPrice" type="number" step="0.01" min="0" className="input" placeholder="0.00" />
        </div>
      </div>
      <div>
        <label className="label">{t("invForm.purchaseDate")}</label>
        <input name="purchaseDate" type="date" required defaultValue={today} className="input" />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
