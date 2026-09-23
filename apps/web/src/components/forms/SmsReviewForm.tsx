"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Sparkles } from "lucide-react";
import { confirmSmsTransaction } from "@/app/actions/sms";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary shrink-0" disabled={pending}>
      <Check size={16} /> {pending ? t("common.saving") : t("review.confirm")}
    </button>
  );
}

/**
 * One tap to say what an SMS transaction was: a category, or a transfer to
 * one of the household's own accounts (which also absorbs the other side's
 * SMS if it is waiting here too).
 */
export function SmsReviewForm({
  id,
  description,
  categories,
  transferAccounts,
  suggestedId,
}: {
  id: string;
  description: string | null;
  categories: { id: string; name: string }[];
  transferAccounts: { id: string; name: string }[];
  /** Preselected from earlier choices (see suggestCategory); still one tap to confirm. */
  suggestedId?: string | null;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await confirmSmsTransaction(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col sm:flex-row gap-2">
        <select name="choice" required className="input flex-1" defaultValue={suggestedId ?? ""}>
          <option value="" disabled>{t("review.pickCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          {transferAccounts.length > 0 && (
            <optgroup label={t("review.transferGroup")}>
              {transferAccounts.map((a) => (
                <option key={a.id} value={`transfer:${a.id}`}>{t("review.transferTo", { name: a.name })}</option>
              ))}
            </optgroup>
          )}
        </select>
        <input
          name="description"
          className="input flex-1"
          defaultValue={description ?? ""}
          placeholder={t("txnForm.descriptionPlaceholder")}
        />
        <Submit />
      </div>
      {suggestedId && (
        <p className="flex items-center gap-1 text-xs text-brand-600">
          <Sparkles size={12} /> {t("review.suggested")}
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
    </form>
  );
}
