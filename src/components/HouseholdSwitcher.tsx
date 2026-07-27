"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { switchHousehold } from "@/app/actions/household";

type HouseholdOption = {
  householdId: string;
  name: string;
  role: string;
};

/** Dropdown to switch the active household; auto-submits on change. */
export function HouseholdSwitcher({
  households,
  activeId,
  role,
}: {
  households: HouseholdOption[];
  activeId: string;
  role: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const householdId = e.target.value;
    if (householdId === activeId) return;
    const fd = new FormData();
    fd.set("householdId", householdId);
    await switchHousehold(fd);
    startTransition(() => router.refresh());
  }

  return (
    <div className="px-3 py-3 border-b border-[var(--border)]">
      <label className="label mb-1">Household</label>
      <div className="relative">
        <select
          value={activeId}
          onChange={onChange}
          disabled={pending}
          className="input appearance-none pr-8 text-sm font-medium"
        >
          {households.map((h) => (
            <option key={h.householdId} value={h.householdId}>
              {h.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown
          size={15}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
      <p className="text-[11px] text-slate-400 mt-1 capitalize">{role.toLowerCase()}</p>
    </div>
  );
}
