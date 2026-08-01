"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncNow } from "@/app/actions/banksync";
import { cn } from "@/lib/utils";

/** "Sync now" for linked bank accounts. Same recipe as RefreshButton. */
export function BankSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const loading = busy || pending;

  async function onClick() {
    setBusy(true);
    setMsg(null);
    setIsError(false);
    try {
      const res = await syncNow();
      if (res.error || res.errors.length) {
        setIsError(true);
        setMsg(res.error ?? res.errors.join(" · "));
      } else {
        setMsg(`Synced ${res.items} account(s): ${res.added} new, ${res.modified} updated`);
      }
      startTransition(() => router.refresh());
    } catch {
      setIsError(true);
      setMsg("Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && (
        <span className={cn("text-xs", isError ? "text-red-500" : "text-green-600")}>{msg}</span>
      )}
      <button onClick={onClick} disabled={loading} className="btn-ghost border border-[var(--border)]">
        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        {loading ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
