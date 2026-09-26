"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { importBrokerPortfolio } from "@/app/actions/broker";
import { useT } from "@/lib/i18n/client";

/** Upload the broker's portfolio export (.xlsx); a new export replaces the last one. */
export function BrokerImportForm() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const res = await importBrokerPortfolio(fd);
      if ("error" in res && res.error) {
        setMsg({ ok: false, text: res.error === "not-a-portfolio" ? t("broker.notPortfolio") : res.error });
      } else if ("ok" in res) {
        const done = t("broker.done", { added: res.added ?? 0, updated: res.updated ?? 0, removed: res.removed ?? 0 });
        setMsg({ ok: true, text: res.sold ? `${done} ${t("broker.sold", { count: res.sold })}` : done });
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-[var(--muted)]">{t("broker.how")}</p>
      <input name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" />
      <p className="text-xs text-slate-400">{t("broker.replaces")}</p>
      {msg && (
        <p className={"text-sm rounded-lg px-3 py-2 " + (msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-600")}>
          {msg.text}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? t("common.saving") : t("broker.import")}
      </button>
    </form>
  );
}
