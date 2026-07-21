"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createCategory } from "@/app/actions/categories";
import { useCloseModal } from "@/components/Modal";
import { CATEGORY_TYPES } from "@/lib/constants";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Saving…" : "Add category"}
    </button>
  );
}

export function CategoryForm() {
  const close = useCloseModal();
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res = await createCategory(formData);
    if (res?.error) setError(res.error);
    else close();
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Name</label>
        <input name="name" required className="input" placeholder="e.g. Subscriptions" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue="EXPENSE">
            {CATEGORY_TYPES.map((t) => (
              <option key={t} value={t}>{t.toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Color</label>
          <input name="color" type="color" defaultValue="#328eff" className="input h-[38px] p-1" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <Submit />
    </form>
  );
}
