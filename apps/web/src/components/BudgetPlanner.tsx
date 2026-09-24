"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, RotateCcw, Shield } from "lucide-react";
import { categoryKind, planBudgets, type PlanPeriod } from "@financemanager/core/budgets";
import { formatMoney } from "@financemanager/core/money";
import { applyBudgetPlan } from "@/app/actions/budgets";
import { createCategory } from "@/app/actions/categories";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; color: string; history: number };

/**
 * The budget planner: income, what to set aside and what is fixed in; a
 * budget per category out, recalculated live as the inputs change. Any row
 * can be edited before saving; edits survive changes to the inputs until
 * reset.
 */
export function BudgetPlanner({
  currency,
  categories,
  historyMonths,
  income: suggestedIncome,
  incomeSource,
  loanInstalments,
  saved,
}: {
  currency: string;
  categories: Category[];
  historyMonths: number;
  income: number;
  incomeSource: "lastMonth" | "thisMonth" | "none";
  loanInstalments: number;
  saved: { savingsRate: number; rent: number; otherFixed: number | null; protectedIds: string[] } | null;
}) {
  const t = useT();
  const router = useRouter();
  const money = (n: number) => formatMoney(n, currency);

  const [income, setIncome] = useState(suggestedIncome);
  const [savingsPct, setSavingsPct] = useState(Math.round((saved?.savingsRate ?? 0.2) * 100));
  const [rent, setRent] = useState(saved?.rent ?? 0);
  const [otherFixed, setOtherFixed] = useState(saved?.otherFixed ?? loanInstalments);
  const [protectedIds, setProtectedIds] = useState<string[]>(
    saved?.protectedIds ??
      categories.filter((c) => ["travel", "entertainment"].includes(categoryKind(c.name) ?? "")).map((c) => c.id),
  );
  // Per-row edits, kept until reset.
  const [edits, setEdits] = useState<Record<string, { amount?: number; period?: PlanPeriod }>>({});
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: true; count?: number; error?: string } | null>(null);

  const plan = useMemo(
    () =>
      planBudgets({
        income,
        savingsRate: savingsPct / 100,
        rent,
        otherFixed,
        categories,
        protectedIds,
      }),
    [income, savingsPct, rent, otherFixed, categories, protectedIds],
  );
  const rows = plan.rows.map((r) => {
    const e = edits[r.categoryId];
    const period = e?.period ?? r.period;
    // Switching period converts the proposal; an edited amount is taken as typed.
    const proposed = period === r.period ? r.amount : period === "WEEKLY" ? Math.round((r.monthly * 12) / 52) : r.monthly;
    return { ...r, period, amount: e?.amount ?? proposed, edited: !!e };
  });
  const hasTravel = categories.some((c) => categoryKind(c.name) === "travel");

  // A travel category created from here was asked for as a priority: protect
  // it as soon as it arrives with the refreshed categories.
  const [protectNewTravel, setProtectNewTravel] = useState(false);
  useEffect(() => {
    if (!protectNewTravel) return;
    const travel = categories.find((c) => categoryKind(c.name) === "travel");
    if (travel) {
      setProtectedIds((p) => (p.includes(travel.id) ? p : [...p, travel.id]));
      setProtectNewTravel(false);
    }
  }, [categories, protectNewTravel]);

  const toggleProtected = (id: string) =>
    setProtectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function apply() {
    setResult(null);
    startTransition(async () => {
      const res = await applyBudgetPlan(
        JSON.stringify({
          savingsRate: savingsPct / 100,
          rent,
          otherFixed,
          protectedIds,
          rows: rows.filter((r) => r.basis !== "rent" || r.amount > 0).map((r) => ({
            categoryId: r.categoryId,
            period: r.period,
            amount: r.amount,
          })),
        }),
      );
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  function addTravel() {
    const fd = new FormData();
    fd.set("name", t("planner.travelName"));
    fd.set("type", "EXPENSE");
    fd.set("color", "#0ea5e9");
    setProtectNewTravel(true);
    startTransition(async () => {
      await createCategory(fd);
      router.refresh();
    });
  }

  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

  return (
    <div className="space-y-6">
      <section className="card p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t("planner.income")}</span>
            <input type="number" inputMode="numeric" className="input" value={income || ""} onChange={(e) => setIncome(num(e.target.value))} />
            <span className="text-xs text-slate-400">
              {money(income)} ·{" "}
              {incomeSource === "lastMonth"
                ? t("planner.incomeFromLastMonth")
                : incomeSource === "thisMonth"
                  ? t("planner.incomeFromThisMonth")
                  : t("planner.incomeNone")}
            </span>
          </label>
          <div>
            <span className="label">{t("planner.savings")}</span>
            <div className="flex gap-2">
              {[10, 20, 30].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSavingsPct(p)}
                  className={cn("btn-ghost border px-3", savingsPct === p ? "border-brand-600 text-brand-600" : "border-[var(--border)]")}
                >
                  {p}%
                </button>
              ))}
              <input
                type="number"
                min={0}
                max={80}
                className="input w-20"
                value={savingsPct}
                onChange={(e) => setSavingsPct(Math.min(80, num(e.target.value)))}
              />
            </div>
            <span className="text-xs text-slate-400">{t("planner.savingsHint", { amount: money(plan.savings) })}</span>
          </div>
          <label className="block">
            <span className="label">{t("planner.rent")}</span>
            <input type="number" inputMode="numeric" className="input" value={rent || ""} onChange={(e) => setRent(num(e.target.value))} />
            <span className="text-xs text-slate-400">{money(rent)}</span>
          </label>
          <label className="block">
            <span className="label">{t("planner.otherFixed")}</span>
            <input type="number" inputMode="numeric" className="input" value={otherFixed || ""} onChange={(e) => setOtherFixed(num(e.target.value))} />
            <span className="text-xs text-slate-400">
              {money(otherFixed)}
              {loanInstalments > 0 && " · " + t("planner.loansIncluded", { amount: money(loanInstalments) })}
            </span>
          </label>
        </div>

        <div>
          <span className="label flex items-center gap-1">
            <Shield size={14} /> {t("planner.protected")}
          </span>
          <div className="flex flex-wrap gap-2">
            {categories
              .filter((c) => categoryKind(c.name) !== "housing")
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleProtected(c.id)}
                  className={cn(
                    "badge border",
                    protectedIds.includes(c.id) ? "border-brand-600 text-brand-600" : "border-[var(--border)] text-slate-500",
                  )}
                >
                  {protectedIds.includes(c.id) && <Check size={12} />} <bdi>{c.name}</bdi>
                </button>
              ))}
            {!hasTravel && (
              <button type="button" onClick={addTravel} disabled={pending} className="badge border border-dashed border-[var(--border)] text-slate-500">
                <Plus size={12} /> {t("planner.addTravel")}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-slate-400">{t("planner.setAside")}</p>
          <p className="text-lg font-semibold tabular-nums text-green-600">{money(plan.savings + plan.extraSavings)}</p>
          {plan.extraSavings > 0 && <p className="text-xs text-slate-400">{t("planner.extraSavings", { amount: money(plan.extraSavings) })}</p>}
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">{t("planner.fixed")}</p>
          <p className="text-lg font-semibold tabular-nums">{money(plan.fixed)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400">{t("planner.flexible")}</p>
          <p className="text-lg font-semibold tabular-nums">{money(plan.flexible)}</p>
          {plan.shortfall > 0 && <p className="text-xs text-red-600">{t("planner.shortfall", { amount: money(plan.shortfall) })}</p>}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="font-semibold">{t("planner.proposal")}</h2>
          {Object.keys(edits).length > 0 && (
            <button type="button" className="btn-ghost text-xs" onClick={() => setEdits({})}>
              <RotateCcw size={14} /> {t("planner.reset")}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {historyMonths > 0 ? t("planner.basisHistory", { months: historyMonths }) : t("planner.basisDefault")}
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">{t("planner.empty")}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <li key={r.categoryId} className="py-2 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[8rem]">
                  <bdi className="font-medium">{r.name}</bdi>
                  {protectedIds.includes(r.categoryId) && <Shield size={12} className="inline ms-1 text-brand-600" />}
                  <span className="block text-xs text-slate-400">
                    {r.basis === "rent" ? t("planner.basisRent") : r.basis === "history" ? t("planner.fromHistory") : t("planner.fromDefault")}
                    {r.period === "WEEKLY" && " · " + t("planner.perMonth", { amount: money(Math.round((r.amount * 52) / 12)) })}
                  </span>
                </span>
                <select
                  className="input w-28"
                  value={r.period}
                  disabled={r.basis === "rent"}
                  onChange={(e) =>
                    setEdits((x) => ({ ...x, [r.categoryId]: { ...x[r.categoryId], period: e.target.value as PlanPeriod, amount: undefined } }))
                  }
                >
                  <option value="WEEKLY">{t("enum.period.WEEKLY")}</option>
                  <option value="MONTHLY">{t("enum.period.MONTHLY")}</option>
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  className={cn("input w-36 tabular-nums", r.edited && "border-brand-600")}
                  value={r.amount}
                  disabled={r.basis === "rent"}
                  onChange={(e) => setEdits((x) => ({ ...x, [r.categoryId]: { ...x[r.categoryId], amount: num(e.target.value) } }))}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button type="button" className="btn-primary" onClick={apply} disabled={pending || rows.length === 0}>
            <Check size={16} /> {pending ? t("common.saving") : t("planner.apply")}
          </button>
          {result?.ok && (
            <span className="text-sm text-green-600">
              {t("planner.applied", { count: result.count ?? 0 })}{" "}
              <Link href="/budgets" className="underline">{t("planner.seeBudgets")}</Link>
            </span>
          )}
          {result?.error && <span className="text-sm text-red-600">{result.error}</span>}
        </div>
      </section>
    </div>
  );
}
