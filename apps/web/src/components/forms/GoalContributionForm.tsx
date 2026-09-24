"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { addGoalContribution } from "@/app/actions/goals";
import { useCloseModal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";
import { DateField } from "@/components/DateField";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : t("common.save")}
    </button>
  );
}

/** Set money aside for a manual goal, or take some back out. */
export function GoalContributionForm({ goalId, suggested }: { goalId: string; suggested: number | null }) {
  const close = useCloseModal();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function action(formData: FormData) {
    setError(null);
    if (out) formData.set("amount", String(-Math.abs(Number(formData.get("amount")))));
    const res = await addGoalContribution(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="goalId" value={goalId} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOut(false)} className={"btn-ghost border flex-1 " + (!out ? "border-brand-600 text-brand-600" : "border-[var(--border)]")}>
          {t("goals.deposit")}
        </button>
        <button type="button" onClick={() => setOut(true)} className={"btn-ghost border flex-1 " + (out ? "border-brand-600 text-brand-600" : "border-[var(--border)]")}>
          {t("goals.withdraw")}
        </button>
      </div>
      <div>
        <label className="label">{t("goals.amount")}</label>
        <input
          name="amount"
          type="number"
          step="any"
          min="0"
          required
          className="input"
          defaultValue={suggested && suggested > 0 ? Math.round(suggested) : undefined}
        />
      </div>
      <div>
        <label className="label">{t("txnForm.date")}</label>
        <DateField name="date" required defaultValue={today} />
      </div>
      <div>
        <label className="label">{t("goals.note")}</label>
        <input name="note" className="input" />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
