"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { runRecurringNow } from "@/app/actions/recurring";

/** Posts all due recurring occurrences for the current user, then refreshes. */
export function RunRecurringButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loading = busy || pending;

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await runRecurringNow();
      setMsg(
        res.posted > 0
          ? `Posted ${res.posted} transaction${res.posted === 1 ? "" : "s"}`
          : "Nothing due",
      );
      startTransition(() => router.refresh());
    } catch {
      setMsg("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button onClick={onClick} disabled={loading} className="btn-ghost border border-[var(--border)]">
        <Play size={16} className={loading ? "animate-pulse" : ""} />
        {loading ? "Posting…" : "Run due now"}
      </button>
    </div>
  );
}
