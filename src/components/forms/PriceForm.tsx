"use client";

import { useFormStatus } from "react-dom";
import { updatePrice } from "@/app/actions/investments";

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost px-2 py-1 text-xs" disabled={pending}>
      {pending ? "…" : "Save"}
    </button>
  );
}

/** Inline "update current price" form for an investment row. */
export function PriceForm({
  id,
  currentPrice,
  currency,
}: {
  id: string;
  currentPrice: number;
  currency: string;
}) {
  const save = async (formData: FormData) => {
    await updatePrice(formData);
  };
  return (
    <>
      <form action={save} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <input
          name="currentPrice"
          type="number"
          step="0.01"
          min="0"
          defaultValue={currentPrice}
          className="input py-1 w-24 text-sm"
        />
        <SaveBtn />
      </form>
      <span className="text-xs text-slate-400">{currency}</span>
    </>
  );
}
