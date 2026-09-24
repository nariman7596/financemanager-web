"use client";

import { useState } from "react";
import { settleBalanceGap } from "@/app/actions/accounts";
import { useT } from "@/lib/i18n/client";

type Mode = "transaction" | "opening";

/**
 * The two ways to close a gap with the bank, each behind a second click.
 *
 * Both buttons make the gap disappear — which is exactly the risk: when the gap
 * is a transaction the app simply has not been told about yet (a purchase whose
 * SMS never arrived), either button hides it, and entering that transaction
 * later counts it twice. That happened for real: a concert ticket folded into
 * the opening balance, then entered by hand. So the first click only asks.
 */
export function SettleGapButtons({
  accountId,
  amount,
  shortfall,
}: {
  accountId: string;
  /** The gap, already formatted. */
  amount: string;
  /** The app is below the bank (so booking it is an expense). */
  shortfall: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode | null>(null);
  const btn = "btn-ghost border border-amber-300 text-xs px-2 py-1";

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className={btn} onClick={() => setMode("transaction")}>
          {shortfall ? t("reconcile.bookExpense") : t("reconcile.bookIncome")}
        </button>
        <button type="button" className={btn} onClick={() => setMode("opening")}>
          {t("reconcile.fixOpening")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <p className="font-medium">{t("reconcile.confirmMissing", { amount })}</p>
      <div className="flex flex-wrap gap-2">
        <form action={settleBalanceGap}>
          <input type="hidden" name="id" value={accountId} />
          <input type="hidden" name="mode" value={mode} />
          <button type="submit" className={btn}>
            {t("reconcile.confirmYes")}
          </button>
        </form>
        <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={() => setMode(null)}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
