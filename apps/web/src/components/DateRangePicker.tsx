"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RANGE_PRESETS, type RangePreset } from "@financemanager/core/date-range";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { DateField } from "@/components/DateField";

export function DateRangePicker({
  preset,
  fromStr,
  toStr,
}: {
  preset: RangePreset;
  fromStr: string;
  toStr: string;
}) {
  const t = useT();
  const router = useRouter();
  const [from, setFrom] = useState(fromStr);
  const [to, setTo] = useState(toStr);
  const [error, setError] = useState<string | null>(null);

  function applyCustom() {
    // Previously this just returned, so pressing Apply with the dates the wrong
    // way round did nothing at all and the page silently kept the old range —
    // easy to read as "these are the figures for the range I picked".
    if (!from || !to) return setError(t("range.errorIncomplete"));
    if (from > to) return setError(t("range.errorOrder"));
    setError(null);
    router.push(`/reports?preset=custom&from=${from}&to=${to}`);
  }

  function pick(setter: (v: string) => void) {
    return (v: string) => {
      setError(null);
      setter(v);
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => router.push(`/reports?preset=${p.key}`)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors",
              preset === p.key
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--hover)]",
            )}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {/* basis-full drops each field onto its own row on a phone — the Jalali
            picker is three selects wide, so two side by side do not fit — while
            basis-auto puts them back inline from `sm` up. */}
        <div className="basis-full sm:basis-auto min-w-0">
          <label className="label">{t("range.from")}</label>
          <DateField value={from} onChange={pick(setFrom)} />
        </div>
        <div className="basis-full sm:basis-auto min-w-0">
          <label className="label">{t("range.to")}</label>
          <DateField value={to} onChange={pick(setTo)} />
        </div>
        <button
          onClick={applyCustom}
          className={cn(
            "btn-ghost border border-[var(--border)]",
            preset === "custom" && "border-brand-500 text-brand-700 dark:text-brand-300",
          )}
        >
          {t("range.applyCustom")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
