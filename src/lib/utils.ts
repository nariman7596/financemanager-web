import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { currencySymbol } from "./constants";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as currency for display. */
export function formatMoney(
  value: number | string,
  currency = "USD",
  opts: { compact?: boolean } = {},
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return `${currencySymbol(currency)}0`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
    }).format(num);
  } catch {
    // Fallback for currencies Intl doesn't know
    return `${currencySymbol(currency)}${num.toFixed(2)}`;
  }
}

/** Convert Prisma Decimal | number | string to a plain JS number. */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}

export function formatDate(date: Date | string, fmt: "short" | "long" = "short") {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: fmt === "long" ? "long" : "short",
    day: "numeric",
  }).format(d);
}
