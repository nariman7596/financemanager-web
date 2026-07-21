"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateSettings } from "@/app/actions/settings";
import { CURRENCIES } from "@/lib/constants";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function SettingsForm({
  name,
  baseCurrency,
}: {
  name: string;
  baseCurrency: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setMsg(null);
    setError(null);
    const res = await updateSettings(formData);
    if (res?.error) setError(res.error);
    else setMsg("Saved");
  }

  return (
    <form action={action} className="space-y-4 max-w-sm">
      <div>
        <label className="label">Name</label>
        <input name="name" defaultValue={name} required className="input" />
      </div>
      <div>
        <label className="label">Base currency</label>
        <select name="baseCurrency" defaultValue={baseCurrency} className="input">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1">
          Dashboards and totals are converted into this currency.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Submit />
        {msg && <span className="text-sm text-green-600">{msg}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
