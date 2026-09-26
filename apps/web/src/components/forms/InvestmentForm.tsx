"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createInvestment, updateInvestment } from "@/app/actions/investments";
import { useCloseModal } from "@/components/Modal";
import { INVESTMENT_TYPES, CURRENCIES } from "@financemanager/core/constants";
import { TGJU_ITEMS } from "@financemanager/core/market";
import { ASSET_CLASSES } from "@financemanager/core/allocation";
import { useT } from "@/lib/i18n/client";
import { DateField } from "@/components/DateField";

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : editing ? t("common.save") : t("invForm.addHolding")}
    </button>
  );
}

export type EditableInvestment = {
  id: string;
  symbol: string;
  name: string;
  type: string;
  quantity: number;
  costBasis: number;
  currentPrice: number;
  currency: string;
  purchaseDate: Date;
  heldForId: string | null;
  priceSource: string | null;
  allocClass: string | null;
};

/**
 * Add a holding, or edit one (`investment`). `people` are the household's
 * PERSON accounts: a holding can be kept for one of them.
 */
export function InvestmentForm({
  defaultCurrency,
  people = [],
  investment,
}: {
  defaultCurrency: string;
  people?: { id: string; name: string }[];
  investment?: EditableInvestment;
}) {
  const close = useCloseModal();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(investment?.type ?? "STOCK");
  const [currency, setCurrency] = useState(investment?.currency ?? defaultCurrency);
  const today = new Date().toISOString().slice(0, 10);
  const fromIranMarket = type === "CRYPTO" && (currency === "IRT" || currency === "IRR");
  // Gold, coins and foreign cash: picked from tgju's list, priced in toman.
  const physical = type === "GOLD" || type === "FX";
  const items = TGJU_ITEMS.filter((i) => i.type === type);
  const [itemKey, setItemKey] = useState(investment?.priceSource?.replace(/^tgju:/, "") ?? "");
  const item = items.find((i) => i.key === itemKey) ?? items[0];
  const currencies = physical ? CURRENCIES.filter((c) => c.code === "IRT" || c.code === "IRR") : CURRENCIES;
  const shownCurrency = physical && currency !== "IRT" && currency !== "IRR" ? "IRT" : currency;

  async function action(formData: FormData) {
    setError(null);
    const res = investment ? await updateInvestment(formData) : await createInvestment(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      {investment && <input type="hidden" name="id" value={investment.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("invForm.type")}</label>
          <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {INVESTMENT_TYPES.map((val) => (
              <option key={val} value={val}>{t("enum.invType." + val)}</option>
            ))}
          </select>
        </div>
        {physical ? (
          <div>
            <label className="label">{t("invForm.item")}</label>
            <select name="priceSource" className="input" value={`tgju:${item.key}`} onChange={(e) => setItemKey(e.target.value.slice(5))}>
              {items.map((i) => (
                <option key={i.key} value={`tgju:${i.key}`}>{t("tgju." + i.key)}</option>
              ))}
            </select>
            <input type="hidden" name="symbol" value={item.symbol} />
            <input type="hidden" name="name" value={t("tgju." + item.key)} />
          </div>
        ) : (
          <div>
            <label className="label">{t("invForm.symbol")}</label>
            <input name="symbol" required className="input" placeholder="USDT" defaultValue={investment?.symbol} />
          </div>
        )}
      </div>
      {physical ? (
        <p className="text-xs text-slate-400 -mt-2">{t("invForm.tgjuHint")}</p>
      ) : (
        <div>
          <label className="label">{t("invForm.name")}</label>
          <input name="name" required className="input" placeholder={t("invForm.namePlaceholder")} defaultValue={investment?.name} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("invForm.quantity")}</label>
          <input
            name="quantity"
            type="number"
            step="any"
            min="0"
            required
            className="input"
            placeholder={physical ? "1" : "10"}
            defaultValue={investment?.quantity}
          />
        </div>
        <div>
          <label className="label">{t("invForm.currency")}</label>
          <select name="currency" className="input" value={shownCurrency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("invForm.costBasis")}</label>
          <input
            name="costBasis"
            type="number"
            step="any"
            min="0"
            required
            className="input"
            placeholder="1500.00"
            defaultValue={investment?.costBasis}
          />
        </div>
        <div>
          <label className="label">{t("invForm.currentPrice")}</label>
          <input
            name="currentPrice"
            type="number"
            step="any"
            min="0"
            className="input"
            placeholder="0.00"
            defaultValue={investment?.currentPrice || undefined}
          />
        </div>
      </div>
      {fromIranMarket && <p className="text-xs text-slate-400 -mt-2">{t("invForm.iranPriceHint")}</p>}
      <div>
        <label className="label">{t("invForm.purchaseDate")}</label>
        <DateField
          name="purchaseDate"
          required
          defaultValue={investment ? investment.purchaseDate.toISOString().slice(0, 10) : today}
        />
      </div>
      <div>
        <label className="label">{t("invForm.allocClass")}</label>
        <select name="allocClass" className="input" defaultValue={investment?.allocClass ?? ""}>
          <option value="">{t("invForm.allocAuto")}</option>
          {ASSET_CLASSES.map((c) => (
            <option key={c} value={c}>{t("alloc." + c)}</option>
          ))}
        </select>
      </div>
      {people.length > 0 && (
        <div>
          <label className="label">{t("invForm.heldFor")}</label>
          <select name="heldForId" className="input" defaultValue={investment?.heldForId ?? ""}>
            <option value="">{t("invForm.heldForMe")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">{t("invForm.heldForHint")}</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit editing={!!investment} />
    </form>
  );
}
