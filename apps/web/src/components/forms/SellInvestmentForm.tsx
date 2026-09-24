"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { sellInvestment } from "@/app/actions/investments";
import { useCloseModal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : t("sell.submit")}
    </button>
  );
}

/** Record that part or all of a holding was sold. */
export function SellInvestmentForm({
  id,
  symbol,
  quantity,
  heldForName,
}: {
  id: string;
  symbol: string;
  quantity: number;
  heldForName: string | null;
}) {
  const close = useCloseModal();
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await sellInvestment(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="label">{t("sell.quantity", { symbol })}</label>
        <input name="quantity" type="number" step="any" min="0" max={quantity} required className="input" defaultValue={quantity} />
        <p className="text-xs text-slate-400 mt-1">{t("sell.have", { quantity: String(quantity), symbol })}</p>
      </div>
      <p className="text-xs text-slate-400">
        {heldForName ? t("sell.moneyHeld", { name: heldForName }) : t("sell.money")}
      </p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
