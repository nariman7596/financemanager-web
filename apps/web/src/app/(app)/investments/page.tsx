import { Plus, Pencil, HandCoins, Wallet as WalletIcon, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { requireHousehold } from "@/lib/household";
import { getBaseCurrency, getInvestments } from "@/lib/queries";
import { sumInCurrency } from "@/lib/currency";
import { getFxAsOf } from "@/lib/marketdata";
import { getMarketQuotes } from "@/lib/iranMarket";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { formatMoney, formatDate, signedMoney } from "@financemanager/core/money";
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
import { BrokerImportForm } from "@/components/forms/BrokerImportForm";
import { walletAddresses } from "@/lib/wallets";
import { TGJU_ITEMS } from "@financemanager/core/market";
import { getT, getLocale } from "@/lib/i18n/server";
import { getRealized, realizedIn, type RealizedRow } from "@/lib/realized";
import { localToday } from "@/lib/bills";
import { RealizedForm } from "@/components/forms/RealizedForm";
import { deleteRealized } from "@/app/actions/realized";
import { startOfMonthIn, endOfMonthIn, startOfYearIn, endOfYearIn } from "@financemanager/core/calendar";
import type { TFunc } from "@financemanager/i18n/translate";
import type { Locale } from "@financemanager/i18n/config";

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
  const realized = await getRealized(ctx.householdId, base);

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

  // Coins quoted by the exchanges, and gold/coins/cash quoted by tgju, apart.
  const coinQuotes = [...quotes.entries()].filter(([, q]) => q.quotes.some((x) => x.source !== "tgju"));
  const tgjuQuotes = TGJU_ITEMS.flatMap((item) => {
    const q = quotes.get(item.symbol)?.quotes.find((x) => x.source === "tgju");
    return q ? [{ item, price: q.price, asOf: q.asOf }] : [];
  });

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
              title={t("broker.title")}
              trigger={<button className="btn-ghost border border-[var(--border)]"><FileSpreadsheet size={18} /> {t("broker.button")}</button>}
            >
              <BrokerImportForm />
            </Modal>
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

      {tgjuQuotes.length > 0 && (
        <div className="card p-4 mb-6">
          <h2 className="text-sm font-semibold mb-2">{t("market.tgjuTitle")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            {tgjuQuotes.map(({ item, price, asOf }) => (
              <div key={item.key} className="flex items-baseline justify-between gap-2" title={formatDate(asOf, locale)}>
                <span className="text-slate-500">{t("tgju." + item.key)}</span>
                <span className="tabular-nums font-medium">{formatMoney(price, "IRT")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {coinQuotes.length > 0 && (
        <div className="card p-4 mb-6 space-y-2">
          <h2 className="text-sm font-semibold">{t("market.title")}</h2>
          {coinQuotes.map(([symbol, q]) => (
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
                      {h.priceSource?.startsWith("tse:") && (
                        <p className="badge mt-1 text-emerald-700 dark:text-emerald-300">{t("broker.badge")}</p>
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
                      {!h.walletId && !h.priceSource?.startsWith("tse:") && <Modal
                        title={t("sell.title", { symbol: h.symbol })}
                        trigger={
                          <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" aria-label={t("sell.title", { symbol: h.symbol })} title={t("sell.title", { symbol: h.symbol })}>
                            <HandCoins size={16} />
                          </button>
                        }
                      >
                        <SellInvestmentForm id={h.id} symbol={h.symbol} quantity={h.quantity} heldForName={h.heldFor?.name ?? null} currentPrice={h.currentPrice} currency={h.currency} />
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
                            priceSource: h.priceSource,
                            allocClass: h.allocClass,
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

      {realized.length > 0 && <RealizedCard rows={realized} base={base} t={t} locale={locale} />}
    </>
  );
}

/** "۱۴۰۵" / "2026": the year of `date` in the reader's calendar. */
function yearIn(date: Date, locale: Locale): string {
  const tag = locale === "fa" ? "fa-IR-u-ca-persian" : "en-US";
  return new Intl.DateTimeFormat(tag, { year: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * What sales actually earned: this month and this year in the reader's
 * calendar, then each sale — estimated ones (from a broker export) marked,
 * with the pencil to put in what the broker paid.
 */
function RealizedCard({ rows, base, t, locale }: { rows: RealizedRow[]; base: string; t: TFunc; locale: Locale }) {
  const today = localToday(locale);
  const month = realizedIn(rows, startOfMonthIn(today, locale), endOfMonthIn(today, locale));
  const year = realizedIn(rows, startOfYearIn(today, locale), endOfYearIn(today, locale));
  const tone = (n: number) => (n > 0 ? "text-green-600" : n < 0 ? "text-red-600" : "text-slate-400");
  return (
    <div className="card p-4 mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-3">
        <h2 className="text-sm font-semibold">{t("realized.title")}</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-slate-400">{t("realized.thisMonth")}</span>{" "}
            <span className={cn("tabular-nums font-semibold", tone(month.gain))}>{signedMoney(month.gain, base)}</span>
          </span>
          <span>
            <span className="text-slate-400">{t("realized.thisYear", { year: yearIn(today, locale) })}</span>{" "}
            <span className={cn("tabular-nums font-semibold", tone(year.gain))}>{signedMoney(year.gain, base)}</span>
          </span>
        </div>
      </div>
      <ul className="divide-y divide-[var(--border)] text-sm">
        {rows.slice(0, 30).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <bdi>{r.symbol}</bdi>
                {r.estimated && <span className="badge ms-2 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{t("realized.estimated")}</span>}
              </p>
              {/* Separate spans, not " · ": a middle dot beside a Persian digit reads as ۰. */}
              <p className="text-xs text-slate-400 flex flex-wrap gap-x-2">
                <span>{formatDate(r.soldAt, locale)}</span>
                <span aria-hidden className="text-slate-300">|</span>
                <span>{t("realized.line", { quantity: r.quantity.toLocaleString("en-US"), proceeds: formatMoney(r.proceeds, r.currency), cost: formatMoney(r.cost, r.currency) })}</span>
              </p>
            </div>
            <span className={cn("inline-flex items-baseline gap-1.5 tabular-nums font-medium", tone(r.gain))}>
              {signedMoney(r.gain, r.currency)}
              {r.cost > 0 && (
                <span className="text-xs" dir="ltr">
                  ({((r.gain / r.cost) * 100).toFixed(1)}%)
                </span>
              )}
            </span>
            <div className="flex items-center">
              <Modal
                title={t("realized.edit", { symbol: r.symbol })}
                trigger={
                  <button className="btn-ghost p-1.5 text-slate-400 hover:text-[var(--text)]" aria-label={t("realized.edit", { symbol: r.symbol })} title={t("realized.edit", { symbol: r.symbol })}>
                    <Pencil size={16} />
                  </button>
                }
              >
                <RealizedForm id={r.id} proceeds={r.proceeds} soldAt={r.soldAt.toISOString().slice(0, 10)} currency={r.currency} estimated={r.estimated} />
              </Modal>
              <DeleteButton action={deleteRealized} id={r.id} label={t("realized.delete")} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
