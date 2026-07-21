"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

function Inner({ label }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-ghost p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
      aria-label={label ?? "Delete"}
      title={label ?? "Delete"}
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
  // Wrap so the form's action returns void (the action's result is unused here).
  const formAction = async (formData: FormData) => {
    await action(formData);
  };

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm("Delete this item? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Inner label={label} />
    </form>
  );
}
