"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createAccount, updateAccount } from "@/app/actions/accounts";
import { useCloseModal } from "@/components/Modal";
import { ACCOUNT_TYPES, CURRENCIES } from "@financemanager/core/constants";
import { rialTomanRescale } from "@financemanager/core/currency";
import { useT } from "@/lib/i18n/client";

function Submit({ editing }: { editing: boolean }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : editing ? t("common.save") : t("accForm.addAccount")}
    </button>
  );
}

export type EditableAccount = {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: number;
  smsMatch: string | null;
};

/** Create an account, or edit one when `account` is given. */
export function AccountForm({ account }: { account?: EditableAccount }) {
  const t = useT();
  const close = useCloseModal();
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(account?.currency ?? "USD");

  async function action(formData: FormData) {
    setError(null);
    const res = account ? await updateAccount(formData) : await createAccount(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  // What happens to the history if the currency changes (edit mode only).
  const changing = !!account && currency !== account.currency;
  const rescale = changing ? rialTomanRescale(account.currency, currency) : null;
  const smsCurrency = currency === "IRR" || currency === "IRT";

  return (
    <form action={action} className="space-y-4">
      {account && <input type="hidden" name="id" value={account.id} />}
      <div>
        <label className="label">{t("accForm.name")}</label>
        <input name="name" required className="input" defaultValue={account?.name} placeholder={t("accForm.namePlaceholder")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("accForm.type")}</label>
          <select name="type" className="input" defaultValue={account?.type ?? "CHECKING"}>
            {ACCOUNT_TYPES.map((val) => (
              <option key={val} value={val}>{t("enum.accountType." + val)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("accForm.currency")}</label>
          <select name="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
      </div>
      {changing && (
        <p className="text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {rescale
            ? t("accForm.rescaleNotice", { from: account.currency, to: currency })
            : t("accForm.currencyChangeNotice")}
        </p>
      )}
      <div>
        <label className="label">{t("accForm.openingBalance")}</label>
        <input
          name="openingBalance"
          type="number"
          step="0.01"
          defaultValue={account?.openingBalance ?? 0}
          className="input"
        />
      </div>
      {(smsCurrency || account?.smsMatch) && (
        <div>
          <label className="label">{t("sms.matchLabel")}</label>
          <input name="smsMatch" dir="auto" className="input" defaultValue={account?.smsMatch ?? ""} placeholder="405943623" />
          <p className="text-xs text-slate-400 mt-1">{t("sms.matchHint")}</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit editing={!!account} />
    </form>
  );
}
