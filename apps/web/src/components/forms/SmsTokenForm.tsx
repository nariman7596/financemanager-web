"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Copy, KeyRound } from "lucide-react";
import { createSmsToken } from "@/app/actions/sms";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary shrink-0" disabled={pending}>
      <KeyRound size={16} /> {pending ? t("common.saving") : t("sms.createKey")}
    </button>
  );
}

/** Creates a device key and shows it exactly once, with a copy button. */
export function SmsTokenForm() {
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function action(formData: FormData) {
    setError(null);
    setCopied(false);
    const res = await createSmsToken(formData);
    if (res.error) setError(res.error);
    else if (res.token) setToken(res.token);
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable; the key is selectable below anyway.
    }
  }

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-col sm:flex-row gap-2">
        <input name="name" className="input flex-1" placeholder={t("sms.keyNamePlaceholder")} maxLength={60} />
        <Submit />
      </form>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {token && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
          <p className="text-sm font-medium">{t("sms.keyOnce")}</p>
          <div className="flex gap-2 items-center">
            <code dir="ltr" className="flex-1 text-xs break-all select-all surface-subtle rounded px-2 py-1.5">{token}</code>
            <button type="button" onClick={copy} className="btn-ghost border border-[var(--border)] shrink-0">
              <Copy size={16} /> {copied ? t("sms.copied") : t("sms.copy")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
