"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { importTransactions, type ImportResult } from "@/app/actions/importexport";
import { useCloseModal } from "@/components/Modal";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Importing…" : "Import CSV"}
    </button>
  );
}

export function ImportForm() {
  const close = useCloseModal();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  async function action(formData: FormData) {
    const res = await importTransactions(formData);
    setResult(res);
    if (res.imported > 0) startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
        <p className="font-medium text-slate-600">Expected columns (header row required):</p>
        <code className="block text-[11px] text-slate-500">
          date, type, amount, currency, account, category, transferAccount, description
        </code>
        <p>
          <span className="font-medium">date</span> as YYYY-MM-DD ·{" "}
          <span className="font-medium">type</span> INCOME / EXPENSE / TRANSFER (default
          EXPENSE). Unknown accounts &amp; categories are created automatically. A file
          exported from here re-imports cleanly.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700 file:font-medium hover:file:bg-brand-100"
        />
        <Submit />
      </form>

      {result && (
        <div className="text-sm space-y-2">
          {result.error ? (
            <p className="text-red-600 bg-red-50 rounded-lg px-3 py-2">{result.error}</p>
          ) : (
            <>
              <p className="text-green-700 bg-green-50 rounded-lg px-3 py-2">
                Imported {result.imported} transaction{result.imported === 1 ? "" : "s"}
                {result.createdAccounts > 0 && ` · ${result.createdAccounts} new account(s)`}
                {result.createdCategories > 0 && ` · ${result.createdCategories} new category(ies)`}
                {result.skipped > 0 && ` · ${result.skipped} skipped`}
              </p>
              {result.errors.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 max-h-40 overflow-y-auto">
                  <p className="font-medium mb-1">Skipped rows:</p>
                  <ul className="space-y-0.5">
                    {result.errors.map((e, i) => (
                      <li key={i}>Row {e.row}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button onClick={close} className="btn-ghost border border-[var(--border)] w-full">
                Done
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
