"use client";

import { useRef, useState, useTransition } from "react";
import { ClipboardPaste } from "lucide-react";
import { pasteSms } from "@/app/actions/sms";
import type { BatchSummary } from "@/lib/sms";
import { useT } from "@/lib/i18n/client";

/**
 * For bank SMS the iOS shortcut never delivered: paste the text, and it goes
 * through the same import as the automation. Collapsed by default so it does
 * not compete with the review queue.
 */
export function PasteSmsForm({ open = false }: { open?: boolean }) {
  const t = useT();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ summary?: BatchSummary; error?: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await pasteSms(data);
      setResult(res);
      if (res.summary && res.summary.booked > 0) form.current?.reset();
    });
  }

  // One line per outcome that happened, in the order a reader cares about.
  const lines = result?.summary
    ? (["booked", "duplicate", "unmatched", "unparsed", "ignored"] as const)
        .filter((k) => result.summary![k] > 0)
        .map((k) => t(`sms.paste.${k}`, { count: result.summary![k] }))
    : [];

  return (
    <details className="card p-4 mb-4" open={open}>
      <summary className="cursor-pointer select-none text-sm font-medium flex items-center gap-2">
        <ClipboardPaste size={16} /> {t("sms.paste.title")}
      </summary>
      <form ref={form} onSubmit={onSubmit} className="mt-3 space-y-2">
        <p className="text-xs text-slate-400">{t("sms.paste.hint")}</p>
        <textarea
          name="text"
          dir="auto"
          rows={6}
          required
          className="input font-sans"
          style={{ unicodeBidi: "plaintext" }}
          placeholder={t("sms.paste.placeholder")}
        />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? t("common.saving") : t("sms.paste.submit")}
        </button>
        {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
        {lines.length > 0 && (
          <ul className="text-sm space-y-0.5">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </form>
    </details>
  );
}
