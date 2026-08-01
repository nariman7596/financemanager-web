"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RANGE_PRESETS, type RangePreset } from "@/lib/dateRange";
import { cn } from "@/lib/utils";

export function DateRangePicker({
  preset,
  fromStr,
  toStr,
}: {
  preset: RangePreset;
  fromStr: string;
  toStr: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromStr);
  const [to, setTo] = useState(toStr);

  function applyCustom() {
    if (!from || !to || from > to) return;
    router.push(`/reports?preset=custom&from=${from}&to=${to}`);
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
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">From</label>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="input w-auto" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="input w-auto" />
        </div>
        <button
          onClick={applyCustom}
          className={cn(
            "btn-ghost border border-[var(--border)]",
            preset === "custom" && "border-brand-500 text-brand-700 dark:text-brand-300",
          )}
        >
          Apply custom
        </button>
      </div>
    </div>
  );
}
