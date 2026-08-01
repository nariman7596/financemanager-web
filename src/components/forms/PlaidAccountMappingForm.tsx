"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mapPlaidAccounts, type AccountMapping } from "@/app/actions/banksync";
import { useCloseModal } from "@/components/Modal";
import type { PlaidAccountOption } from "@/lib/plaid";

type UnlinkedAccount = { id: string; name: string; currency: string };

/**
 * Shown after a Plaid Link exchange succeeds: match each account the bank
 * returned to one of this household's existing (unlinked) Accounts, or skip
 * it. Mirrors ImportForm's persisted-result-panel pattern since there can be
 * a multi-row result to review before dismissing.
 */
export function PlaidAccountMappingForm({
  plaidItemDbId,
  plaidAccounts,
  unlinkedAccounts,
  presetAccountId,
}: {
  plaidItemDbId: string;
  plaidAccounts: PlaidAccountOption[];
  unlinkedAccounts: UnlinkedAccount[];
  presetAccountId?: string;
}) {
  const close = useCloseModal();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    presetAccountId && plaidAccounts.length === 1
      ? { [plaidAccounts[0].plaidAccountId]: presetAccountId }
      : {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const mappings: AccountMapping[] = plaidAccounts.map((a) => ({
      plaidAccountId: a.plaidAccountId,
      localAccountId: choices[a.plaidAccountId] ?? null,
    }));
    const res = await mapPlaidAccounts(plaidItemDbId, mappings);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(true);
    startTransition(() => router.refresh());
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
          Bank connected. Transactions will appear shortly.
        </p>
        <button onClick={close} className="btn-ghost border border-[var(--border)] w-full">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Match each account from your bank to an existing account here, or leave it
        skipped.
      </p>
      <div className="space-y-3">
        {plaidAccounts.map((pa) => (
          <div key={pa.plaidAccountId} className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">{pa.name}</p>
              <p className="text-xs text-slate-400">{pa.mask ? `••••${pa.mask}` : pa.type}</p>
            </div>
            <select
              className="input max-w-[55%]"
              value={choices[pa.plaidAccountId] ?? ""}
              onChange={(e) =>
                setChoices((c) => ({ ...c, [pa.plaidAccountId]: e.target.value }))
              }
            >
              <option value="">Skip</option>
              {unlinkedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary w-full">
        {busy ? "Linking…" : "Link selected accounts"}
      </button>
    </div>
  );
}
