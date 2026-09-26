"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissBillSuggestion, saveBill, setBillActive } from "@/app/actions/bills";
import { useT } from "@/lib/i18n/client";

type Suggestion = { name: string; amount: number; currency: string; dueDay: number; matchKind: string; matchValue: string };

function toForm(s: Suggestion) {
  const fd = new FormData();
  fd.set("name", s.name);
  fd.set("amount", String(Math.round(s.amount)));
  fd.set("currency", s.currency);
  fd.set("dueDay", String(s.dueDay));
  fd.set("leadDays", "3");
  fd.set("matchKind", s.matchKind);
  fd.set("matchValue", s.matchValue);
  return fd;
}

/** Take a suggested bill as it is, or say it is not one (it will not be suggested again). */
export function SuggestionActions({ suggestion }: { suggestion: Suggestion }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: (fd: FormData) => Promise<unknown>) =>
    start(async () => {
      await fn(toForm(suggestion));
      router.refresh();
    });
  return (
    <div className="flex gap-2">
      <button type="button" className="btn-primary text-sm px-3 py-1" disabled={pending} onClick={() => run(saveBill)}>
        {t("bills.addSuggestion")}
      </button>
      <button type="button" className="btn-ghost text-sm px-3 py-1" disabled={pending} onClick={() => run(dismissBillSuggestion)}>
        {t("bills.notABill")}
      </button>
    </div>
  );
}

export function PauseBillButton({ id, active }: { id: string; active: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost text-xs px-2 py-1"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          fd.set("active", active ? "0" : "1");
          await setBillActive(fd);
          router.refresh();
        })
      }
    >
      {active ? t("bills.pause") : t("bills.resume")}
    </button>
  );
}
