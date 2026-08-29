"use client";

import { useMemo, useState } from "react";
import { useT, useLocale } from "@/lib/i18n/client";
import {
  JALALI_MONTHS,
  daysInJalaliMonth,
  fromJalaliParts,
  toJalaliParts,
  todayYmd,
} from "@financemanager/core/calendar";

type Props = {
  /** Form-field name. Omit in controlled mode — nothing is submitted. */
  name?: string;
  defaultValue?: string; // Gregorian yyyy-MM-dd
  required?: boolean;
  className?: string;
  /** Controlled mode: pass both to drive the value from the parent. */
  value?: string;
  onChange?: (gregorianYmd: string) => void;
};

/**
 * Date input that shows the reader's calendar.
 *
 * `<input type="date">` is the browser's own control and always renders
 * Gregorian, so a Persian user picking "today" saw 2026-08-12 instead of
 * ۲۱ مرداد ۱۴۰۵. For `fa` this renders year/month/day selects in Jalali and
 * submits the Gregorian `yyyy-MM-dd` through a hidden input, so server
 * actions, validation and the database see exactly what they did before.
 *
 * English keeps the native control — it is better than anything hand-rolled.
 */
export function DateField({
  name,
  defaultValue = "",
  required,
  className,
  value,
  onChange,
}: Props) {
  const t = useT();
  const locale = useLocale();

  if (locale !== "fa") {
    return onChange
      ? (
        <input
          type="date"
          required={required}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={className ?? "input"}
        />
      )
      : (
        <input
          name={name}
          type="date"
          required={required}
          defaultValue={defaultValue}
          className={className ?? "input"}
        />
      );
  }

  return (
    <JalaliDateField
      name={name}
      defaultValue={defaultValue}
      required={required}
      className={className}
      value={value}
      onChange={onChange}
      emptyLabel={t("dateField.empty")}
    />
  );
}

function JalaliDateField({
  name,
  defaultValue,
  required,
  className,
  value,
  onChange,
  emptyLabel,
}: Props & { emptyLabel: string }) {
  const t = useT();
  // An optional field (e.g. a recurrence end date) starts genuinely empty;
  // a required one falls back to today so the form is valid from the start.
  const controlled = typeof onChange === "function";

  const initial = useMemo(() => {
    const seed = defaultValue || (required ? todayYmd() : "");
    return seed ? toJalaliParts(seed) : null;
  }, [defaultValue, required]);

  const [internal, setInternal] = useState(initial);
  // In controlled mode the parent owns the value, so derive from it every
  // render rather than keeping a second copy that can drift.
  const parts = controlled ? (value ? toJalaliParts(value) : null) : internal;

  const years = useMemo(() => {
    const current = toJalaliParts(todayYmd())?.year ?? 1400;
    // Wide enough for back-dating old transactions and scheduling ahead.
    return Array.from({ length: 21 }, (_, i) => current - 15 + i);
  }, []);

  const dayCount = parts ? daysInJalaliMonth(parts.year, parts.month) : 31;

  function update(next: Partial<NonNullable<typeof parts>>) {
    const base = parts ?? toJalaliParts(todayYmd())!;
    const merged = { ...base, ...next };
    // Shorten the day if the new month is shorter — 31 Mordad exists, 31 Aban
    // does not, and Esfand is 29 or 30 depending on the year.
    const max = daysInJalaliMonth(merged.year, merged.month);
    if (merged.day > max) merged.day = max;
    if (controlled) onChange!(fromJalaliParts(merged));
    else setInternal(merged);
  }

  return (
    // flex-wrap + shrinkable selects. Three selects do not fit in half of a
    // modal row (~194px), let alone on a phone: without wrapping, the year
    // select was pushed outside the container and clipped, leaving no way to
    // change the year at all. They now wrap to a second line when narrow.
    <div className={className ?? "flex flex-wrap gap-2"}>
      {/* Uncontrolled (form) mode: this is what gets submitted — Gregorian,
          exactly as the native input produced. */}
      {!controlled && name && (
        <input type="hidden" name={name} value={parts ? fromJalaliParts(parts) : ""} />
      )}

      <select
        aria-label={t("dateField.day")}
        className="input w-auto min-w-0 flex-1 basis-16"
        value={parts?.day ?? ""}
        onChange={(e) => update({ day: Number(e.target.value) })}
      >
        {!parts && <option value="">{emptyLabel}</option>}
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <select
        aria-label={t("dateField.month")}
        className="input w-auto min-w-0 flex-1 basis-24"
        value={parts?.month ?? ""}
        onChange={(e) => update({ month: Number(e.target.value) })}
      >
        {!parts && <option value="">{emptyLabel}</option>}
        {JALALI_MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>

      <select
        aria-label={t("dateField.year")}
        className="input w-auto min-w-0 flex-1 basis-20"
        value={parts?.year ?? ""}
        onChange={(e) => update({ year: Number(e.target.value) })}
      >
        {!parts && <option value="">{emptyLabel}</option>}
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
