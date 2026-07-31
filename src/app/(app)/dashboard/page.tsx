import { requireHousehold } from "@/lib/household";
import {
  getBaseCurrency,
  getNetWorth,
  getMonthlyFlow,
  getCashFlowSeries,
  getSpendingByCategory,
  getBudgetProgress,
  getSpendingByMember,
} from "@/lib/queries";
import { formatMoney } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { CashFlowChart, SpendingPieChart } from "@/components/Charts";
import { BudgetBar } from "@/components/BudgetBar";
import { MemberSpending } from "@/components/MemberSpending";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);

  const [netWorth, flow, series, spending, budgets, byMember] = await Promise.all([
    getNetWorth(ctx.householdId, base),
    getMonthlyFlow(ctx.householdId, base),
    getCashFlowSeries(ctx.householdId, base, 6),
    getSpendingByCategory(ctx.householdId, base),
    getBudgetProgress(ctx.householdId),
    getSpendingByMember(ctx.householdId, base),
  ]);

  const monthName = new Date().toLocaleString("en-US", { month: "long" });

  return (
    <>
      <Topbar
        title={`Welcome${ctx.name ? `, ${ctx.name.split(" ")[0]}` : ""}`}
        subtitle={`Your money at a glance · ${monthName}`}
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Net worth" value={formatMoney(netWorth.total, base)} hint={`in ${base}`} />
        <StatCard label={`Income (${monthName})`} value={formatMoney(flow.income, base)} tone="positive" />
        <StatCard label={`Expenses (${monthName})`} value={formatMoney(flow.expense, base)} tone="negative" />
        <StatCard
          label="Net this month"
          value={formatMoney(flow.net, base)}
          tone={flow.net >= 0 ? "positive" : "negative"}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold mb-4">Cash flow · last 6 months</h2>
          <CashFlowChart data={series} currency={base} />
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Spending by category</h2>
          <SpendingPieChart data={spending} currency={base} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Assets</h2>
          </div>
          <div className="space-y-3 text-sm">
            <Row label="Cash & accounts" value={formatMoney(netWorth.cash, base)} />
            <Row label="Investments" value={formatMoney(netWorth.investments, base)} />
            <div className="border-t border-[var(--border)] pt-3">
              <Row label="Total net worth" value={formatMoney(netWorth.total, base)} bold />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Budgets</h2>
            <Link href="/budgets" className="text-sm text-brand-600 hover:underline">Manage</Link>
          </div>
          {budgets.length === 0 ? (
            <p className="text-sm text-slate-400">
              No budgets yet.{" "}
              <Link href="/budgets" className="text-brand-600 hover:underline">Set one up</Link>.
            </p>
          ) : (
            <div className="space-y-4">
              {budgets.slice(0, 5).map((b) => (
                <BudgetBar key={b.id} budget={b} />
              ))}
            </div>
          )}
        </div>
      </section>

      {byMember.members > 1 && (
        <section className="mt-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Spending by member · {monthName}</h2>
              <span className="text-sm text-slate-400">who spent what</span>
            </div>
            <MemberSpending rows={byMember.rows} currency={base} />
          </div>
        </section>
      )}
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-medium" : "text-[var(--muted)]"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
