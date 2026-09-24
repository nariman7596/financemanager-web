import Link from "next/link";
import { Plus, Pencil, HandCoins, Target } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { prisma } from "@/lib/prisma";
import { getAccountBalances, getBaseCurrency } from "@/lib/queries";
import { getGoalSplit, getGoals } from "@/lib/goals";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { DeleteButton } from "@/components/DeleteButton";
import { GoalForm } from "@/components/forms/GoalForm";
import { GoalContributionForm } from "@/components/forms/GoalContributionForm";
import { deleteGoal } from "@/app/actions/goals";
import { formatDate, formatMoney, toNumber } from "@financemanager/core/money";
import { startOfMonthIn } from "@financemanager/core/calendar";
import { getT, getLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  done: "text-emerald-600",
  onTrack: "text-emerald-600",
  behind: "text-amber-600",
  overdue: "text-red-600",
  open: "text-slate-400",
};

export default async function GoalsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const now = new Date();

  const [goals, balances, holdings] = await Promise.all([
    getGoals(ctx.householdId, startOfMonthIn(now, locale), now),
    getAccountBalances(ctx.householdId),
    prisma.investment.findMany({
      where: { householdId: ctx.householdId, heldForId: null },
      select: { id: true, symbol: true, name: true, quantity: true, currentPrice: true, currency: true },
    }),
  ]);
  const split = goals.length > 0 ? await getGoalSplit(ctx.householdId, base, locale, goals) : null;

  const accountOptions = balances
    .filter((a) => a.type !== "PERSON" && a.type !== "LOAN" && !a.isArchived)
    .map((a) => ({ id: a.id, name: a.name, hint: formatMoney(a.balance, a.currency) }));
  const holdingOptions = holdings.map((h) => ({
    id: h.id,
    name: `${h.symbol} · ${h.name}`,
    hint: formatMoney(toNumber(h.quantity) * toNumber(h.currentPrice), h.currency),
  }));
  const canEdit = ctx.role !== "VIEWER";

  return (
    <>
      <Topbar
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        action={
          canEdit ? (
            <Modal title={t("goals.new")} trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}>
              <GoalForm defaultCurrency={base} accounts={accountOptions} holdings={holdingOptions} />
            </Modal>
          ) : null
        }
      />

      {goals.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 space-y-2">
          <Target className="mx-auto" size={28} />
          <p>{t("goals.empty")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {split ? (
            <section className="card p-5">
              <h2 className="font-semibold mb-1">{t("goals.splitTitle")}</h2>
              <p className="text-xs text-slate-400 mb-3">{t("goals.splitHint", { amount: formatMoney(split.monthly, base) })}</p>
              <ul className="space-y-1 text-sm">
                {goals.map((g) => (
                  <li key={g.id} className="flex justify-between gap-3">
                    <bdi>{g.name}</bdi>
                    <span className="tabular-nums">{formatMoney(split.amounts[g.id] ?? 0, base)}</span>
                  </li>
                ))}
              </ul>
              {split.shortfall > 0 && (
                <p className="text-sm text-red-600 mt-3">{t("goals.shortfall", { amount: formatMoney(split.shortfall, base) })}</p>
              )}
              {split.spare > 0 && (
                <p className="text-sm text-emerald-600 mt-3">{t("goals.spare", { amount: formatMoney(split.spare, base) })}</p>
              )}
            </section>
          ) : (
            <p className="text-sm text-slate-400">
              {t("goals.noPlan")} <Link href="/budgets/plan" className="text-brand-600 underline">{t("planner.title")}</Link>
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((g) => {
              const p = g.progress;
              const money = (n: number) => formatMoney(n, g.currency);
              return (
                <div key={g.id} className="card p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold"><bdi>{g.name}</bdi></p>
                      <p className="text-xs text-slate-400">
                        {g.targetDate ? t("goals.by", { date: formatDate(g.targetDate, locale) }) : t("goals.noDate")}
                        {" · "}
                        {g.source === "LINKED" ? t("goals.linkedTo", { names: g.linkedNames.join("، ") || "—" }) : t("goals.source.MANUAL")}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center">
                        {g.source === "MANUAL" && (
                          <Modal
                            title={t("goals.contribute", { name: g.name })}
                            trigger={
                              <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" title={t("goals.deposit")} aria-label={t("goals.deposit")}>
                                <HandCoins size={16} />
                              </button>
                            }
                          >
                            <GoalContributionForm goalId={g.id} suggested={split?.amounts[g.id] ?? p.perMonth} />
                          </Modal>
                        )}
                        <Modal
                          title={t("goals.edit", { name: g.name })}
                          trigger={
                            <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" title={t("accForm.edit")} aria-label={t("accForm.edit")}>
                              <Pencil size={16} />
                            </button>
                          }
                        >
                          <GoalForm
                            defaultCurrency={base}
                            accounts={accountOptions}
                            holdings={holdingOptions}
                            goal={{
                              id: g.id,
                              name: g.name,
                              target: g.target,
                              currency: g.currency,
                              targetDate: g.targetDate,
                              source: g.source,
                              accountIds: g.accountIds,
                              investmentIds: g.investmentIds,
                            }}
                          />
                        </Modal>
                        <DeleteButton action={deleteGoal} id={g.id} label={t("goals.delete")} />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1 tabular-nums">
                      <span>{money(g.saved)} / {money(g.target)}</span>
                      <span className="font-medium">{Math.round(p.share * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full surface-subtle overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", p.status === "behind" || p.status === "overdue" ? "bg-amber-500" : "bg-emerald-500")}
                        style={{ width: `${Math.round(p.share * 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className={cn("text-sm", STATUS_CLASS[p.status])}>
                    {p.status === "done"
                      ? t("goals.status.done")
                      : p.perMonth !== null
                        ? t("goals.status." + p.status, {
                            remaining: money(p.remaining),
                            perMonth: money(p.perMonth),
                            months: p.monthsLeft ?? 0,
                          })
                        : t("goals.status.open", { remaining: money(p.remaining) })}
                  </p>
                  {g.thisMonth !== null && (
                    <p className="text-xs text-slate-400">{t("goals.thisMonth", { amount: money(g.thisMonth) })}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
