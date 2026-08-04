"use client";

import { useState } from "react";
import Script from "next/script";
import { createLinkToken, exchangePublicTokenAction } from "@/app/actions/banksync";
import { PlaidAccountMappingForm } from "@/components/forms/PlaidAccountMappingForm";
import type { PlaidAccountOption } from "@/lib/plaid";
import { useT } from "@/lib/i18n/client";

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string) => void;
        onExit?: () => void;
      }) => { open: () => void };
    };
  }
}

type UnlinkedAccount = { id: string; name: string; currency: string };

/**
 * Loads Plaid's Link JS (first external-script use in this app, hence
 * next/script rather than a bundled import — Plaid doesn't ship an npm
 * widget) and drives the connect flow: get a link token, open Link, exchange
 * the resulting public_token, then hand off to PlaidAccountMappingForm.
 */
export function PlaidLinkButton({
  unlinkedAccounts,
  presetAccountId,
  label: labelProp,
}: {
  unlinkedAccounts: UnlinkedAccount[];
  presetAccountId?: string;
  label?: string;
}) {
  const t = useT();
  const label = labelProp ?? t("accounts.connectBank");
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchanged, setExchanged] = useState<{
    plaidItemDbId: string;
    accounts: PlaidAccountOption[];
  } | null>(null);

  async function launch() {
    if (!window.Plaid) return;
    setBusy(true);
    setError(null);
    const res = await createLinkToken();
    if (res.error || !res.linkToken) {
      setError(res.error ?? t("plaid.couldNotStart"));
      setBusy(false);
      return;
    }
    const handler = window.Plaid.create({
      token: res.linkToken,
      onSuccess: async (publicToken) => {
        const exch = await exchangePublicTokenAction(publicToken);
        setBusy(false);
        if (exch.error || !exch.plaidItemDbId || !exch.accounts) {
          setError(exch.error ?? t("plaid.couldNotConnect"));
          return;
        }
        setExchanged({ plaidItemDbId: exch.plaidItemDbId, accounts: exch.accounts });
      },
      onExit: () => setBusy(false),
    });
    handler.open();
  }

  if (exchanged) {
    return (
      <PlaidAccountMappingForm
        plaidItemDbId={exchanged.plaidItemDbId}
        plaidAccounts={exchanged.accounts}
        unlinkedAccounts={unlinkedAccounts}
        presetAccountId={presetAccountId}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="lazyOnload"
        onReady={() => setScriptReady(true)}
      />
      <p className="text-sm text-[var(--muted)]">
        {t("plaid.sandboxHint", { user: "user_good", pass: "pass_good" })}
      </p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={launch} disabled={!scriptReady || busy} className="btn-primary w-full">
        {busy ? t("plaid.connecting") : label}
      </button>
    </div>
  );
}
