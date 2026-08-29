"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfile } from "@/app/actions/settings";
import { useT } from "@/lib/i18n/client";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? t("common.saving") : t("settings.save")}
    </button>
  );
}

/** Personal profile: display name. */
export function SettingsForm({ name }: { name: string }) {
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setMsg(null);
    setError(null);
    const res = await updateProfile(formData);
    if (res?.error) setError(res.error);
    else setMsg(t("settings.saved"));
  }

  return (
    <form action={action} className="space-y-4 max-w-sm">
      <div>
        <label className="label">{t("settings.name")}</label>
        <input name="name" defaultValue={name} required className="input" />
      </div>
      <div className="flex items-center gap-3">
        <Submit />
        {msg && <span className="text-sm text-green-600">{msg}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
