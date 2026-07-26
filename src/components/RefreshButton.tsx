"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshMarketData } from "@/app/actions/market";
import { cn } from "@/lib/utils";

/**
 * "Refresh rates & prices" button. Calls the market-data action, then refreshes
 * the route so updated numbers render. Shows a short result summary.
 */
export function RefreshButton({ asOf }: { asOf: string | null }) {
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
      const res = await refreshMarketData();
      const errs = [res.fx.error, res.prices.error].filter(Boolean);
      if (errs.length) {
        setIsError(true);
        setMsg(errs.join(" · "));
      } else {
        setMsg(
          `Updated ${res.fx.updated} rates, ${res.prices.updated} prices` +
            (res.prices.skipped ? ` (${res.prices.skipped} skipped)` : ""),
        );
      }
      startTransition(() => router.refresh());
    } catch {
      setIsError(true);
      setMsg("Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {asOf && !msg && (
        <span className="text-xs text-slate-400">Rates as of {asOf}</span>
      )}
      {msg && (
        <span className={cn("text-xs", isError ? "text-red-500" : "text-green-600")}>
          {msg}
        </span>
      )}
      <button onClick={onClick} disabled={loading} className="btn-ghost border border-[var(--border)]">
        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
