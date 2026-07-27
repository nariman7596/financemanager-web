"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfile } from "@/app/actions/settings";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

/** Personal profile: display name. */
export function SettingsForm({ name }: { name: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setMsg(null);
    setError(null);
    const res = await updateProfile(formData);
    if (res?.error) setError(res.error);
    else setMsg("Saved");
  }

  return (
    <form action={action} className="space-y-4 max-w-sm">
      <div>
        <label className="label">Name</label>
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
