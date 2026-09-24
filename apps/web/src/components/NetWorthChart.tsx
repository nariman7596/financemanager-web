"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@financemanager/core/money";
import { seriesChange } from "@financemanager/core/networth";
import { useIsDark, chartTheme } from "@/lib/useIsDark";
import { useLocale, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Point = { day: string; total: number; usd: number | null };
const RANGES = [30, 90, 365, 0] as const; // 0 = all

const LINE = "#1b6ff5";

/**
 * The household's worth over time: one line, in toman or (from the first day a
 * dollar rate was recorded) in dollars. Two scales never share an axis — the
 * unit switch swaps the whole chart.
 */
export function NetWorthChart({ points, currency }: { points: Point[]; currency: string }) {
  const t = useT();
  const locale = useLocale();
  const theme = chartTheme(useIsDark());
  const [range, setRange] = useState<(typeof RANGES)[number]>(90);
  const hasUsd = points.some((p) => p.usd !== null);
  const [unit, setUnit] = useState<"base" | "usd">("base");

  const data = useMemo(() => {
    const last = points.at(-1);
    let rows = points;
    if (range > 0 && last) {
      const cutoff = new Date(last.day).getTime() - range * 24 * 60 * 60 * 1000;
      rows = points.filter((p) => new Date(p.day).getTime() >= cutoff);
    }
    const key = unit === "usd" ? "usd" : "total";
    return rows
      .filter((p) => (key === "usd" ? p.usd !== null : true))
      .map((p) => ({ day: p.day, value: (key === "usd" ? p.usd : p.total) as number }));
  }, [points, range, unit]);

  const cur = unit === "usd" ? "USD" : currency;
  // Compact for toman-sized numbers; in full below a million, where compact
  // rounds neighbouring ticks (7,480 and 7,520) to the same "7.5K".
  const tag = locale === "fa" ? "fa-IR" : "en-US";
  const axisNumber = {
    format: (v: number) =>
      new Intl.NumberFormat(tag, Math.abs(v) >= 1e6 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(v),
  };
  const money = (n: number) => formatMoney(n, cur);
  const dayLabel = (iso: string, long = false) =>
    new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", {
      day: "numeric",
      month: long ? "long" : "short",
      ...(long ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    }).format(new Date(iso));
  const change = seriesChange(data.map((d) => d.value));
  const now = data.at(-1)?.value ?? 0;

  if (points.length < 2) {
    return <p className="text-sm text-slate-400">{t("networth.tooEarly")}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-2xl font-semibold tabular-nums">{money(now)}</p>
          {change && (
            <p className={cn("text-sm tabular-nums", change.change >= 0 ? "text-emerald-600" : "text-red-600")}>
              {change.change >= 0 ? "+" : "−"}
              {money(Math.abs(change.change))}
              {change.pct !== null && ` (${(change.pct * 100).toFixed(1)}%)`}{" "}
              <span className="text-slate-400">{range ? t("networth.inDays", { days: range }) : t("networth.sinceStart")}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn("px-2.5 py-1", range === r ? "bg-brand-600 text-white" : "hover:bg-[var(--hover)]")}
              >
                {r === 0 ? t("networth.all") : r === 365 ? t("networth.year") : t("networth.days", { days: r })}
              </button>
            ))}
          </div>
          {hasUsd && (
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
              {(["base", "usd"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn("px-2.5 py-1", unit === u ? "bg-brand-600 text-white" : "hover:bg-[var(--hover)]")}
                >
                  {u === "usd" ? t("networth.inUsd") : t("networth.inBase")}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {unit === "usd" && <p className="text-xs text-slate-400 -mt-2 mb-2">{t("networth.usdHint")}</p>}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.25} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 12, fill: theme.axis }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
            tickFormatter={(d) => dayLabel(d)}
          />
          <YAxis
            tick={{ fontSize: 12, fill: theme.axis }}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
            // Numbers only: the unit is in the heading, and "1.8B تومان" wraps.
            tickFormatter={(v) => axisNumber.format(v)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: `1px solid ${theme.tooltipBorder}`,
              background: theme.tooltipBg,
              color: theme.tooltipText,
              fontSize: 12,
            }}
            labelStyle={{ color: theme.tooltipText }}
            itemStyle={{ color: theme.tooltipText }}
            cursor={{ stroke: theme.axis, strokeDasharray: "3 3" }}
            labelFormatter={(d) => dayLabel(String(d), true)}
            formatter={(v: number) => [money(v), t("networth.title")]}
          />
          <Area type="linear" dataKey="value" stroke={LINE} strokeWidth={2} fill="url(#nwFill)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
