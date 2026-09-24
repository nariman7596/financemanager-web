"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createGoal, updateGoal } from "@/app/actions/goals";
import { useCloseModal } from "@/components/Modal";
import { CURRENCIES } from "@financemanager/core/constants";
import { useT } from "@/lib/i18n/client";
import { DateField } from "@/components/DateField";
import { cn } from "@/lib/utils";

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : editing ? t("common.save") : t("goals.create")}
    </button>
  );
}

export type GoalOption = { id: string; name: string; hint: string };

export type EditableGoal = {
  id: string;
  name: string;
  target: number;
  currency: string;
  targetDate: Date | null;
  source: "MANUAL" | "LINKED";
  accountIds: string[];
  investmentIds: string[];
};

/**
 * Add or edit a goal. MANUAL: money is set aside by hand from the goal card.
 * LINKED: the goal holds whatever its chosen accounts and holdings hold.
 */
export function GoalForm({
  defaultCurrency,
  accounts,
  holdings,
  goal,
}: {
  defaultCurrency: string;
  accounts: GoalOption[];
  holdings: GoalOption[];
  goal?: EditableGoal;
}) {
  const close = useCloseModal();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"MANUAL" | "LINKED">(goal?.source ?? "MANUAL");

  async function action(formData: FormData) {
    setError(null);
    const res = goal ? await updateGoal(formData) : await createGoal(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <div>
        <label className="label">{t("goals.name")}</label>
        <input name="name" required className="input" placeholder={t("goals.namePlaceholder")} defaultValue={goal?.name} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("goals.target")}</label>
          <input name="targetAmount" type="number" step="any" min="0" required className="input" defaultValue={goal?.target} />
        </div>
        <div>
          <label className="label">{t("invForm.currency")}</label>
          <select name="currency" className="input" defaultValue={goal?.currency ?? defaultCurrency}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">{t("goals.date")}</label>
        <DateField name="targetDate" defaultValue={goal?.targetDate ? goal.targetDate.toISOString().slice(0, 10) : ""} />
        <p className="text-xs text-slate-400 mt-1">{t("goals.dateHint")}</p>
      </div>

      <div>
        <span className="label">{t("goals.source")}</span>
        <input type="hidden" name="source" value={source} />
        <div className="grid grid-cols-2 gap-2">
          {(["MANUAL", "LINKED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={cn(
                "rounded-lg border p-2 text-start text-sm",
                source === s ? "border-brand-600 text-brand-600" : "border-[var(--border)]",
              )}
            >
              <span className="font-medium block">{t("goals.source." + s)}</span>
              <span className="text-xs text-slate-400">{t("goals.sourceHint." + s)}</span>
            </button>
          ))}
        </div>
      </div>

      {source === "LINKED" && (
        <div className="space-y-2">
          {[...accounts.map((a) => ({ ...a, field: "accountIds", on: goal?.accountIds.includes(a.id) })),
            ...holdings.map((h) => ({ ...h, field: "investmentIds", on: goal?.investmentIds.includes(h.id) }))].map((o) => (
            <label key={o.field + o.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={o.field} value={o.id} defaultChecked={o.on} />
              <bdi className="font-medium">{o.name}</bdi>
              <span className="text-xs text-slate-400 ms-auto tabular-nums">{o.hint}</span>
            </label>
          ))}
          {accounts.length + holdings.length === 0 && <p className="text-xs text-slate-400">{t("goals.nothingToLink")}</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit editing={!!goal} />
    </form>
  );
}
