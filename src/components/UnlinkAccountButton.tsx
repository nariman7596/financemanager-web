"use client";

import { useFormStatus } from "react-dom";
import { unlinkAccount } from "@/app/actions/banksync";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-slate-400 hover:text-red-600 underline underline-offset-2"
    >
      {pending ? "Unlinking…" : "Unlink"}
    </button>
  );
}

/** Unlinks an Account from its PlaidItem; transaction history is kept. */
export function UnlinkAccountButton({ id }: { id: string }) {
  const formAction = async (formData: FormData) => {
    await unlinkAccount(formData);
  };

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Unlink this account from your bank? Transaction history stays.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Inner />
    </form>
  );
}
