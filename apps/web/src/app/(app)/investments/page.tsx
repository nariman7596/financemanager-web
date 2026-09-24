import { Plus, Pencil, HandCoins } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getBaseCurrency, getInvestments } from "@/lib/queries";
import { sumInCurrency } from "@/lib/currency";
import { getFxAsOf } from "@/lib/marketdata";
import { getMarketQuotes } from "@/lib/iranMarket";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { formatMoney, formatDate } from "@financemanager/core/money";
import { Topbar } from "@/components/Topbar";
import { Modal } from "@/components/Modal";
import { StatCard } from "@/components/StatCard";
import { RefreshButton } from "@/components/RefreshButton";
import { InvestmentForm } from "@/components/forms/InvestmentForm";
import { DeleteButton } from "@/components/DeleteButton";
import { PriceForm } from "@/components/forms/PriceForm";
import { SellInvestmentForm } from "@/components/forms/SellInvestmentForm";
import { deleteInvestment } from "@/app/actions/investments";
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const [holdings, fxAsOf, people, quotes] = await Promise.all([
    getInvestments(ctx.householdId),
    getFxAsOf(),
    prisma.account.findMany({
      where: { householdId: ctx.householdId, type: "PERSON", isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getMarketQuotes(),
  ]);

  // Totals are the household's own; what is kept for others is theirs.
  const mine = holdings.filter((h) => !h.heldForId);
  const held = holdings.filter((h) => h.heldForId);
  const inBase = (list: typeof holdings, pick: (h: (typeof holdings)[number]) => number) =>
    sumInCurrency(list.map((h) => ({ amount: pick(h), currency: h.currency })), base);
  const [totalValue, totalCost, heldValue] = await Promise.all([
    inBase(mine, (h) => h.value),
    inBase(mine, (h) => h.costBasis),
    inBase(held, (h) => h.value),
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
              <InvestmentForm defaultCurrency={base} people={people} />
            </Modal>
          </div>
        }
      />

      <div className={cn("grid gap-4 mb-6", held.length > 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
        <StatCard label={t("inv.portfolioValue")} value={formatMoney(totalValue, base)} hint={t("common.inCurrency", { code: base })} />
        <StatCard label={t("inv.totalCost")} value={formatMoney(totalCost, base)} />
        <StatCard
          label={t("inv.totalGain")}
          value={`${formatMoney(totalGain, base)} (${totalGainPct.toFixed(1)}%)`}
          tone={totalGain >= 0 ? "positive" : "negative"}
        />
        {held.length > 0 && (
          <StatCard label={t("inv.heldForOthers")} value={formatMoney(heldValue, base)} hint={t("inv.heldForOthersHint")} />
        )}
      </div>

      {quotes.size > 0 && (
        <div className="card p-4 mb-6 space-y-2">
          <h2 className="text-sm font-semibold">{t("market.title")}</h2>
          {[...quotes.entries()].map(([symbol, q]) => (
            <div key={symbol} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="font-medium w-14">{symbol}</span>
              {q.quotes.map((x) => (
                <span
                  key={x.source}
                  className={cn("tabular-nums", q.consensus?.used.includes(x.source) ? "" : "text-slate-400 line-through")}
                  title={formatDate(x.asOf, locale)}
                >
                  <span className="text-xs text-slate-400">{t("market." + x.source)}</span> {formatMoney(x.price, "IRT")}
                </span>
              ))}
              {q.consensus && (
                <span className="tabular-nums font-semibold ms-auto">
                  <span className="text-xs font-normal text-slate-400">{t("market.used")}</span> {formatMoney(q.consensus.price, "IRT")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

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
                      {h.heldFor && (
                        <p className="badge mt-1 text-amber-700 dark:text-amber-300">{t("inv.heldBadge", { name: h.heldFor.name })}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--muted)]">{h.quantity}</td>
                    <td className="px-4 py-3">
                      <PriceForm id={h.id} currentPrice={h.currentPrice} currency={h.currency} />
                    </td>
                    {/* No price yet is not a 100% loss. */}
                    {h.currentPrice > 0 ? (
                      <>
                        <td className="px-4 py-3 text-end tabular-nums font-medium">
                          {formatMoney(h.value, h.currency)}
                        </td>
                        <td className={cn(
                          "px-4 py-3 text-end tabular-nums font-medium",
                          h.gain >= 0 ? "text-green-600" : "text-red-600",
                        )}>
                          {formatMoney(h.gain, h.currency)}
                          <span className="block text-xs font-normal">
                            {h.gainPct.toFixed(1)}%{h.heldFor && " · " + t("inv.gainIsTheirs", { name: h.heldFor.name })}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td colSpan={2} className="px-4 py-3 text-end text-xs text-slate-400">{t("inv.noPrice")}</td>
                    )}
                    <td className="px-2 py-3 text-end whitespace-nowrap">
                      <Modal
                        title={t("sell.title", { symbol: h.symbol })}
                        trigger={
                          <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" aria-label={t("sell.title", { symbol: h.symbol })} title={t("sell.title", { symbol: h.symbol })}>
                            <HandCoins size={16} />
                          </button>
                        }
                      >
                        <SellInvestmentForm id={h.id} symbol={h.symbol} quantity={h.quantity} heldForName={h.heldFor?.name ?? null} />
                      </Modal>
                      <Modal
                        title={t("inv.edit", { symbol: h.symbol })}
                        trigger={
                          <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" aria-label={t("inv.edit", { symbol: h.symbol })} title={t("inv.edit", { symbol: h.symbol })}>
                            <Pencil size={16} />
                          </button>
                        }
                      >
                        <InvestmentForm
                          defaultCurrency={base}
                          people={people}
                          investment={{
                            id: h.id,
                            symbol: h.symbol,
                            name: h.name,
                            type: h.type,
                            quantity: h.quantity,
                            costBasis: h.costBasis,
                            currentPrice: h.currentPrice,
                            currency: h.currency,
                            purchaseDate: h.purchaseDate,
                            heldForId: h.heldForId,
                          }}
                        />
                      </Modal>
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
