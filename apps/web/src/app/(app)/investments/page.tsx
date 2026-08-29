import { Plus } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getBaseCurrency, getInvestments } from "@/lib/queries";
import { sumInCurrency } from "@/lib/currency";
import { getFxAsOf } from "@/lib/marketdata";
import { cn } from "@/lib/utils";
import { formatMoney, formatDate } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { StatCard } from "@/components/StatCard";
import { RefreshButton } from "@/components/RefreshButton";
import { InvestmentForm } from "@/components/forms/InvestmentForm";
import { DeleteButton } from "@/components/DeleteButton";
import { PriceForm } from "@/components/forms/PriceForm";
import { deleteInvestment } from "@/app/actions/investments";
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const holdings = await getInvestments(ctx.householdId);
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
        title={t("inv.title")}
        subtitle={t("inv.subtitle")}
        action={
          <div className="flex items-center gap-3">
            <RefreshButton asOf={fxAsOf ? formatDate(fxAsOf, locale) : null} />
            <Modal
              title={t("inv.new")}
              trigger={<button className="btn-primary"><Plus size={18} /> {t("common.add")}</button>}
            >
              <InvestmentForm defaultCurrency={base} />
            </Modal>
          </div>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={t("inv.portfolioValue")} value={formatMoney(totalValue, base)} hint={t("common.inCurrency", { code: base })} />
        <StatCard label={t("inv.totalCost")} value={formatMoney(totalCost, base)} />
        <StatCard
          label={t("inv.totalGain")}
          value={`${formatMoney(totalGain, base)} (${totalGainPct.toFixed(1)}%)`}
          tone={totalGain >= 0 ? "positive" : "negative"}
        />
      </div>

      {holdings.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          {t("inv.empty")}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="surface-subtle text-[var(--muted)] text-start">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("inv.colSymbol")}</th>
                  <th className="px-4 py-3 font-medium">{t("inv.colQty")}</th>
                  <th className="px-4 py-3 font-medium">{t("inv.colPrice")}</th>
                  <th className="px-4 py-3 font-medium text-end">{t("inv.colValue")}</th>
                  <th className="px-4 py-3 font-medium text-end">{t("inv.colGain")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.id} className="border-t border-[var(--border)] row-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{h.symbol}</p>
                      <p className="text-xs text-slate-400">{h.name} · {t("enum.invType." + h.type)}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--muted)]">{h.quantity}</td>
                    <td className="px-4 py-3">
                      <PriceForm id={h.id} currentPrice={h.currentPrice} currency={h.currency} />
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums font-medium">
                      {formatMoney(h.value, h.currency)}
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-end tabular-nums font-medium",
                      h.gain >= 0 ? "text-green-600" : "text-red-600",
                    )}>
                      {formatMoney(h.gain, h.currency)}
                      <span className="block text-xs font-normal">{h.gainPct.toFixed(1)}%</span>
                    </td>
                    <td className="px-2 py-3 text-end">
                      <DeleteButton action={deleteInvestment} id={h.id} label={t("inv.deleteHolding")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
