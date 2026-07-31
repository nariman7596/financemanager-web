import { formatMoney } from "@/lib/utils";

type MemberRow = { id: string; name: string; spent: number; earned: number };

// Horizontal "who spent what" breakdown for the current month. Bars are sized
// relative to the biggest spender.
export function MemberSpending({
  rows,
  currency,
}: {
  rows: MemberRow[];
  currency: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.spent));

  if (rows.every((r) => r.spent === 0 && r.earned === 0)) {
    return (
      <div className="h-[120px] grid place-items-center text-sm text-slate-400">
        No activity recorded this month
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium truncate">{r.name}</span>
            <span className="tabular-nums text-[var(--muted)]">
              {formatMoney(r.spent, currency)} spent
              {r.earned > 0 && (
                <span className="text-green-600"> · {formatMoney(r.earned, currency)} in</span>
              )}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--subtle-strong)] overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.round((r.spent / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
