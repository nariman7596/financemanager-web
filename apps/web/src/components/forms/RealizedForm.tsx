"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateRealized } from "@/app/actions/realized";
import { useCloseModal } from "@/components/Modal";
import { DateField } from "@/components/DateField";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : t("common.save")}
    </button>
  );
}

/** Put in what a sale actually brought in (the broker's statement) and when. */
export function RealizedForm({
  id,
  proceeds,
  soldAt,
  currency,
  estimated,
}: {
  id: string;
  proceeds: number;
  soldAt: string;
  currency: string;
  estimated: boolean;
}) {
  const close = useCloseModal();
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await updateRealized(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      {estimated && <p className="text-sm text-[var(--muted)]">{t("realized.estimatedHow")}</p>}
      <div>
        <label className="label">{t("realized.proceedsLabel", { currency })}</label>
        <input name="proceeds" type="number" step="any" min="0" required className="input" defaultValue={proceeds} />
        <p className="text-xs text-slate-400 mt-1">{t("realized.proceedsHint")}</p>
      </div>
      <div>
        <label className="label">{t("realized.date")}</label>
        <DateField name="soldAt" required defaultValue={soldAt} />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
