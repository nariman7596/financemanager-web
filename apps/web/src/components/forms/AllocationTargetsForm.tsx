"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ASSET_CLASSES, type AssetClass } from "@financemanager/core/allocation";
import { saveAllocationTargets } from "@/app/actions/allocation";
import { useCloseModal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";

/** Target percent per asset class; they must add up to 100, or all be empty to clear. */
export function AllocationTargetsForm({ targets }: { targets: Partial<Record<AssetClass, number>> }) {
  const t = useT();
  const close = useCloseModal();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(ASSET_CLASSES.map((c) => [c, targets[c] ? String(targets[c]) : ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const sum = ASSET_CLASSES.reduce((s, c) => s + (Number(values[c]) || 0), 0);
  const ok = sum === 0 || Math.abs(sum - 100) <= 0.5;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveAllocationTargets(fd);
      if (res?.error) setError(t("alloc.sumError"));
      else {
        close();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-[var(--muted)]">{t("alloc.targetsHelp")}</p>
      {ASSET_CLASSES.map((c) => (
        <div key={c} className="flex items-center gap-3">
          <label className="flex-1 text-sm" htmlFor={`t_${c}`}>{t("alloc." + c)}</label>
          <input
            id={`t_${c}`}
            name={c}
            type="number"
            min="0"
            max="100"
            step="any"
            className="input w-24 text-sm tabular-nums"
            value={values[c]}
            onChange={(e) => setValues({ ...values, [c]: e.target.value })}
          />
          <span className="text-sm text-slate-400">%</span>
        </div>
      ))}
      <p className={"text-sm tabular-nums " + (ok ? "text-slate-400" : "text-red-600")}>{t("alloc.sum", { sum: Math.round(sum * 10) / 10 })}</p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={pending || !ok}>
        {pending ? t("common.saving") : t("common.save")}
      </button>
    </form>
  );
}
