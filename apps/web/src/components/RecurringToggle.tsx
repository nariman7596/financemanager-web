"use client";

import { Pause, Play } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toggleRecurring } from "@/app/actions/recurring";
import { useT } from "@/lib/i18n/client";

function Btn({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-ghost p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50"
      title={active ? t("recurring.pause") : t("recurring.resume")}
      aria-label={active ? t("recurring.pauseAria") : t("recurring.resumeAria")}
    >
      {active ? <Pause size={16} /> : <Play size={16} />}
    </button>
  );
}

/** Pause/resume toggle for a recurring rule. */
export function RecurringToggle({ id, active }: { id: string; active: boolean }) {
  const action = async (formData: FormData) => {
    await toggleRecurring(formData);
  };
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Btn active={active} />
    </form>
  );
}
