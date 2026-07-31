"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { formatMoney } from "@/lib/utils";
import { useIsDark, chartTheme } from "@/lib/useIsDark";

export function CashFlowChart({
  data,
  currency,
}: {
  data: { month: string; income: number; expense: number; net: number }[];
  currency: string;
}) {
  const t = chartTheme(useIsDark());
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: t.axis }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: t.axis }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v) => formatMoney(v, currency, { compact: true })}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: `1px solid ${t.tooltipBorder}`,
            background: t.tooltipBg,
            color: t.tooltipText,
            fontSize: 12,
          }}
          labelStyle={{ color: t.tooltipText }}
          itemStyle={{ color: t.tooltipText }}
          cursor={{ fill: t.grid, opacity: 0.4 }}
          formatter={(v: number) => formatMoney(v, currency)}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
        <Bar dataKey="income" name="Income" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="net" name="Net" stroke="#1b6ff5" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SpendingPieChart({
  data,
  currency,
}: {
  data: { name: string; value: number; color: string }[];
  currency: string;
}) {
  const t = chartTheme(useIsDark());
  if (data.length === 0) {
    return (
      <div className="h-[280px] grid place-items-center text-sm text-slate-400">
        No spending recorded this month
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          stroke={t.tooltipBg}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: `1px solid ${t.tooltipBorder}`,
            background: t.tooltipBg,
            color: t.tooltipText,
            fontSize: 12,
          }}
          labelStyle={{ color: t.tooltipText }}
          itemStyle={{ color: t.tooltipText }}
          formatter={(v: number) => formatMoney(v, currency)}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: t.axis }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
