import { Plus, Pencil, HandCoins, Wallet as WalletIcon, AlertTriangle } from "lucide-react";
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
import { deleteWallet } from "@/app/actions/wallets";
import { WalletForm } from "@/components/forms/WalletForm";
import { walletAddresses } from "@/lib/wallets";
import { getT, getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const t = await getT();
  const locale = await getLocale();
  const ctx = await requireHousehold();
  const base = await getBaseCurrency(ctx.householdId);
  const [holdings, fxAsOf, people, quotes, wallets] = await Promise.all([
    getInvestments(ctx.householdId),
    getFxAsOf(),
    prisma.account.findMany({
      where: { householdId: ctx.householdId, type: "PERSON", isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getMarketQuotes(),
    prisma.wallet.findMany({ where: { householdId: ctx.householdId }, orderBy: { createdAt: "asc" } }),
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

  // Each wallet's worth, and in dollars at the exchanges' USDT rate — the
  // figure the wallet app itself shows, to compare against.
  const usdt = quotes.get("USDT")?.consensus?.price ?? null;
  const inUsd = (value: number, currency: string) =>
    currency === "USD" ? value : usdt && currency === "IRT" ? value / usdt : usdt && currency === "IRR" ? value / usdt / 10 : null;
  const walletRows = await Promise.all(
    wallets.map(async (w) => {
      const own = holdings.filter((h) => h.walletId === w.id);
      const usd = own.map((h) => inUsd(h.value, h.currency));
      return {
        ...w,
        addresses: walletAddresses(w.addresses),
        failed: Object.keys((w.errors as Record<string, string> | null) ?? {}),
        count: own.length,
        value: await inBase(own, (h) => h.value),
        usd: usd.every((v) => v !== null) ? usd.reduce<number>((s, v) => s + (v ?? 0), 0) : null,
      };
    }),
  );
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

      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-2"><WalletIcon size={16} /> {t("wallet.title")}</h2>
          <Modal
            title={t("wallet.new")}
            trigger={<button className="btn-ghost text-sm"><Plus size={16} /> {t("wallet.add")}</button>}
          >
            <WalletForm />
          </Modal>
        </div>
        {walletRows.length === 0 ? (
          <p className="text-sm text-slate-400">{t("wallet.empty")}</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {walletRows.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-slate-400">
                    {t("wallet.assets", { n: w.count })}
                    {w.syncedAt && " · " + t("wallet.syncedAt", { date: formatDate(w.syncedAt, locale) })}
                  </p>
                  {w.failed.length > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                      <AlertTriangle size={12} /> {t("wallet.failed", { chains: w.failed.join("، ") })}
                    </p>
                  )}
                </div>
                <div className="ms-auto text-end tabular-nums">
                  <p className="font-semibold">{formatMoney(w.value, base)}</p>
                  {w.usd !== null && base !== "USD" && <p className="text-xs text-slate-400">≈ {formatMoney(w.usd, "USD")}</p>}
                </div>
                <div className="whitespace-nowrap">
                  <Modal
                    title={t("wallet.edit", { name: w.name })}
                    trigger={
                      <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" aria-label={t("wallet.edit", { name: w.name })} title={t("wallet.edit", { name: w.name })}>
                        <Pencil size={16} />
                      </button>
                    }
                  >
                    <WalletForm wallet={{ id: w.id, name: w.name, addresses: w.addresses }} />
                  </Modal>
                  <DeleteButton action={deleteWallet} id={w.id} label={t("wallet.delete")} />
                </div>
              </div>
            ))}
          </div>
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
                      {h.wallet && (
                        <p className="badge mt-1 text-brand-700 dark:text-brand-300">{t("wallet.badge", { name: h.wallet.name })}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--muted)]">{h.quantity}</td>
                    <td className="px-4 py-3">
                      {/* Keyed by price: the input is uncontrolled, and a refresh must show the new one. */}
                      <PriceForm key={h.currentPrice} id={h.id} currentPrice={h.currentPrice} currency={h.currency} />
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
                      {/* A wallet's balance comes from its chain: selling there shows up on the next read. */}
                      {!h.walletId && <Modal
                        title={t("sell.title", { symbol: h.symbol })}
                        trigger={
                          <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" aria-label={t("sell.title", { symbol: h.symbol })} title={t("sell.title", { symbol: h.symbol })}>
                            <HandCoins size={16} />
                          </button>
                        }
                      >
                        <SellInvestmentForm id={h.id} symbol={h.symbol} quantity={h.quantity} heldForName={h.heldFor?.name ?? null} />
                      </Modal>}
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
