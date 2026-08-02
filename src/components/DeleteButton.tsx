"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";

function Inner({ label }: { label?: string }) {
  const { pending } = useFormStatus();
  const t = useT();
  const text = label ?? t("common.delete");
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-ghost p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
      aria-label={text}
      title={text}
    >
      <Trash2 size={16} />
    </button>
  );
}

/**
 * Small delete form. Pass a server action and the row id.
 * Usage: <DeleteButton action={deleteTransaction} id={t.id} />
 */
export function DeleteButton({
  action,
  id,
  label,
  confirm = true,
}: {
  action: (formData: FormData) => Promise<unknown>;
  id: string;
  label?: string;
  confirm?: boolean;
}) {
  const t = useT();
  // Wrap so the form's action returns void (the action's result is unused here).
  const formAction = async (formData: FormData) => {
    await action(formData);
  };

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(t("common.confirmDelete"))) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Inner label={label} />
    </form>
  );
}
