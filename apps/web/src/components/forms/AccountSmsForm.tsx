"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setAccountSmsMatch } from "@/app/actions/sms";
import { useCloseModal } from "@/components/Modal";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("common.saving") : t("common.save")}
    </button>
  );
}

/** The number this account's bank prints in its SMS. */
export function AccountSmsForm({ id, smsMatch }: { id: string; smsMatch: string | null }) {
  const t = useT();
  const close = useCloseModal();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await setAccountSmsMatch(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="label">{t("sms.matchLabel")}</label>
        <input
          name="smsMatch"
          dir="ltr"
          inputMode="numeric"
          className="input"
          defaultValue={smsMatch ?? ""}
          placeholder="405943623"
        />
        <p className="text-xs text-slate-400 mt-1">{t("sms.matchHint")}</p>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
