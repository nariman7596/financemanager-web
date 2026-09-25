"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { saveWallet } from "@/app/actions/wallets";
import { useCloseModal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";
import { ADDRESS_KINDS, type AddressKind } from "@financemanager/core/wallets";

/** What each network's address starts with, as a hint in the empty field. */
const PLACEHOLDER: Record<AddressKind, string> = {
  evm: "0x…",
  tron: "T…",
  ton: "UQ… / EQ…",
  solana: "…",
  near: "…",
  xrp: "r…",
  bitcoin: "bc1… / 1… / 3…",
  litecoin: "ltc1… / L… / M…",
  dash: "X…",
};

/**
 * Add or edit a followed wallet: a name and the public address of each
 * network it uses. Submitted with onSubmit + a transition, not <form action>:
 * React resets a form after an action, which would wipe every pasted address
 * when one of them is refused.
 */
export function WalletForm({
  wallet,
}: {
  wallet?: { id: string; name: string; addresses: Partial<Record<AddressKind, string>> };
}) {
  const close = useCloseModal();
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<AddressKind[]>([]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setInvalid([]);
    start(async () => {
      const res = await saveWallet(fd);
      if ("invalid" in res && res.invalid) setInvalid(res.invalid);
      else if ("error" in res && res.error) setError(res.error);
      else close();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {wallet && <input type="hidden" name="id" value={wallet.id} />}
      <p className="flex gap-2 text-xs rounded-lg px-3 py-2 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <ShieldCheck size={16} className="shrink-0" />
        {t("wallet.safety")}
      </p>
      <div>
        <label className="label">{t("wallet.name")}</label>
        <input name="name" required className="input" placeholder="Tangem" defaultValue={wallet?.name} />
      </div>
      <div className="space-y-3">
        {ADDRESS_KINDS.map((kind) => (
          <div key={kind}>
            <label className="label" htmlFor={`addr_${kind}`}>{t("wallet.net." + kind)}</label>
            <input
              id={`addr_${kind}`}
              name={`addr_${kind}`}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={"input font-mono text-xs" + (invalid.includes(kind) ? " border-red-500" : "")}
              placeholder={PLACEHOLDER[kind]}
              defaultValue={wallet?.addresses[kind] ?? ""}
            />
            {invalid.includes(kind) && <p className="text-xs text-red-600 mt-1">{t("wallet.invalid")}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">{t("wallet.hint")}</p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? t("wallet.reading") : t("common.save")}
      </button>
    </form>
  );
}
