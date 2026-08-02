"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { importTransactions, type ImportResult } from "@/app/actions/importexport";
import { useCloseModal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("import.importing") : t("import.importCsv")}
    </button>
  );
}

export function ImportForm() {
  const t = useT();
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
      <div className="text-xs text-[var(--muted)] surface-subtle rounded-lg p-3 space-y-1">
        <p className="font-medium text-[var(--muted)]">{t("import.expectedColumns")}</p>
        <code className="block text-[11px] text-slate-500">
          date, type, amount, currency, account, category, transferAccount, description
        </code>
        <p>{t("import.columnsHelp")}</p>
      </div>

      <form action={action} className="space-y-4">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700 file:font-medium hover:file:bg-brand-100"
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
                {result.imported === 1
                  ? t("import.importedOne")
                  : t("import.imported", { n: result.imported })}
                {result.createdAccounts > 0 && t("import.newAccounts", { n: result.createdAccounts })}
                {result.createdCategories > 0 && t("import.newCategories", { n: result.createdCategories })}
                {result.skipped > 0 && t("import.skippedCount", { n: result.skipped })}
              </p>
              {result.errors.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 max-h-40 overflow-y-auto">
                  <p className="font-medium mb-1">{t("import.skippedRows")}</p>
                  <ul className="space-y-0.5">
                    {result.errors.map((e, i) => (
                      <li key={i}>{t("import.rowError", { row: e.row, message: e.message })}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button onClick={close} className="btn-ghost border border-[var(--border)] w-full">
                {t("common.done")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
