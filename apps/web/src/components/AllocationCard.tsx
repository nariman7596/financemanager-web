"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Target } from "lucide-react";
import { ASSET_CLASSES, type AllocationRow, type AssetClass } from "@financemanager/core/allocation";
import { formatMoney } from "@financemanager/core/money";
import { useIsDark, chartTheme } from "@/lib/useIsDark";
import { useLocale, useT } from "@/lib/i18n/client";
import { Modal } from "@/components/Modal";
import { AllocationTargetsForm } from "@/components/forms/AllocationTargetsForm";

/**
 * Categorical slots 1–6 of the validated palette, one per class in the fixed
 * class order — a class keeps its colour whatever its size or rank. Dark
 * values are the same hues stepped for the dark surface.
 */
const COLORS: Record<AssetClass, [string, string]> = {
  CASH: ["#2a78d6", "#3987e5"],
  GOLD: ["#eb6834", "#d95926"],
  USD: ["#1baf7a", "#199e70"],
  CRYPTO: ["#eda100", "#c98500"],
  STOCK: ["#e87ba4", "#d55181"],
  OTHER: ["#008300", "#008300"],
};

type Props = {
  rows: AllocationRow[];
  total: number;
  debts: number;
  currency: string;
  targets: Partial<Record<AssetClass, number>>;
  history: Record<string, number | string>[];
};

export function AllocationCard({ rows, total, debts, currency, targets, history }: Props) {
  const t = useT();
  const locale = useLocale();
  const dark = useIsDark();
  const theme = chartTheme(dark);
  const color = (c: AssetClass) => COLORS[c][dark ? 1 : 0];
  const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
  // Stacked in the fixed class order, so segments never trade places.
  const ordered = ASSET_CLASSES.map((c) => rows.find((r) => r.cls === c)).filter((r): r is AllocationRow => !!r);
  const hasTargets = rows.some((r) => r.target !== null);
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso));

  const bar = (share: (r: AllocationRow) => number, label: string, thin = false) => (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-10 shrink-0">{label}</span>
      <div className={"flex flex-1 gap-[2px] " + (thin ? "h-2" : "h-4")} role="img" aria-label={label}>
        {ordered.filter((r) => share(r) > 0).map((r) => (
          <div
            key={r.cls}
            className="first:rounded-s last:rounded-e min-w-[2px]"
            style={{ width: `${share(r) * 100}%`, background: color(r.cls), opacity: thin ? 0.55 : 1 }}
            title={`${t("alloc." + r.cls)} · ${pct(share(r))}`}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold">{t("alloc.title")}</h2>
        <Modal
          title={t("alloc.targetsTitle")}
          trigger={
            <button className="btn-ghost text-sm">
              <Target size={16} /> {hasTargets ? t("alloc.editTargets") : t("alloc.setTargets")}
            </button>
          }
        >
          <AllocationTargetsForm targets={targets} />
        </Modal>
      </div>

      {total <= 0 ? (
        <p className="text-sm text-slate-400">{t("alloc.empty")}</p>
      ) : (
        <>
          <div className="space-y-1.5 mb-4">
            {bar((r) => r.share, t("alloc.now"))}
            {hasTargets && bar((r) => r.target ?? 0, t("alloc.target"), true)}
          </div>

          <ul className="divide-y divide-[var(--border)] text-sm">
            {rows.map((r) => (
              <li key={r.cls} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: color(r.cls) }} />
                <span className="font-medium">{t("alloc." + r.cls)}</span>
                <bdi dir="ltr" className="text-slate-400 tabular-nums">{pct(r.share)}</bdi>
                {r.target !== null && (
                  <span className="text-xs text-slate-400">
                    {t("alloc.target")} <bdi dir="ltr">{pct(r.target)}</bdi>
                  </span>
                )}
                <span className="ms-auto tabular-nums">{formatMoney(r.value, currency)}</span>
                {r.toTarget !== null && Math.abs(r.toTarget) >= total * 0.01 && (
                  <span className={"basis-full text-xs " + (r.toTarget > 0 ? "text-emerald-600" : "text-amber-600")}>
                    {r.toTarget > 0
                      ? t("alloc.below", { amount: formatMoney(r.toTarget, currency) })
                      : t("alloc.above", { amount: formatMoney(-r.toTarget, currency) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {debts > 0 && <p className="text-xs text-slate-400 mt-2">{t("alloc.debts", { amount: formatMoney(debts, currency) })}</p>}

          {history.length >= 2 && (
            <div className="mt-5">
              <h3 className="text-sm font-medium mb-2">{t("alloc.trend")}</h3>
              {/* Time runs left to right in both languages; RTL flips the axis text into the plot. */}
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={history} stackOffset="expand" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: theme.axis, direction: locale === "fa" ? "rtl" : "ltr" }} axisLine={false} tickLine={false} minTickGap={40} tickFormatter={dayLabel} />
                  <YAxis tick={{ fontSize: 12, fill: theme.axis }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: `1px solid ${theme.tooltipBorder}`, background: theme.tooltipBg, color: theme.tooltipText, fontSize: 12 }}
                    labelFormatter={(d) => dayLabel(String(d))}
                    formatter={(v: number, name: string) => [pct(v), t("alloc." + name)]}
                  />
                  {ASSET_CLASSES.filter((c) => history.some((h) => Number(h[c]) > 0)).map((c) => (
                    <Area key={c} type="linear" dataKey={c} stackId="1" stroke={color(c)} strokeWidth={1} fill={color(c)} fillOpacity={0.85} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
