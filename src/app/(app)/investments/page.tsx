import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBaseCurrency, getInvestments } from "@/lib/queries";
import { sumInCurrency } from "@/lib/currency";
import { getFxAsOf } from "@/lib/marketdata";
import { formatMoney, formatDate, cn } from "@/lib/utils";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { StatCard } from "@/components/StatCard";
import { RefreshButton } from "@/components/RefreshButton";
import { InvestmentForm } from "@/components/forms/InvestmentForm";
import { DeleteButton } from "@/components/DeleteButton";
import { PriceForm } from "@/components/forms/PriceForm";
import { deleteInvestment } from "@/app/actions/investments";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const user = await requireUser();
  const base = await getBaseCurrency(user.userId);
  const holdings = await getInvestments(user.userId);
  const fxAsOf = await getFxAsOf();

  const [totalValue, totalCost] = await Promise.all([
    sumInCurrency(holdings.map((h) => ({ amount: h.value, currency: h.currency })), base),
    sumInCurrency(holdings.map((h) => ({ amount: h.costBasis, currency: h.currency })), base),
  ]);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  return (
    <>
      <Topbar
        title="Investments"
        subtitle="Your portfolio"
        action={
          <div className="flex items-center gap-3">
            <RefreshButton asOf={fxAsOf ? formatDate(fxAsOf) : null} />
            <Modal
              title="New holding"
              trigger={<button className="btn-primary"><Plus size={18} /> Add</button>}
            >
              <InvestmentForm defaultCurrency={base} />
            </Modal>
          </div>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Portfolio value" value={formatMoney(totalValue, base)} hint={`in ${base}`} />
        <StatCard label="Total cost" value={formatMoney(totalCost, base)} />
        <StatCard
          label="Total gain / loss"
          value={`${formatMoney(totalGain, base)} (${totalGainPct.toFixed(1)}%)`}
          tone={totalGain >= 0 ? "positive" : "negative"}
        />
      </div>

      {holdings.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No holdings yet. Add stocks, crypto, ETFs and more to track your portfolio.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium text-right">Value</th>
                <th className="px-4 py-3 font-medium text-right">Gain</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id} className="border-t border-[var(--border)] hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium">{h.symbol}</p>
                    <p className="text-xs text-slate-400">{h.name} · {h.type.toLowerCase()}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{h.quantity}</td>
                  <td className="px-4 py-3">
                    <PriceForm id={h.id} currentPrice={h.currentPrice} currency={h.currency} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatMoney(h.value, h.currency)}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right tabular-nums font-medium",
                    h.gain >= 0 ? "text-green-600" : "text-red-600",
                  )}>
                    {formatMoney(h.gain, h.currency)}
                    <span className="block text-xs font-normal">{h.gainPct.toFixed(1)}%</span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <DeleteButton action={deleteInvestment} id={h.id} label="Delete holding" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
