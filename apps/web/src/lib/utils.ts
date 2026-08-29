import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Money/date formatting moved to @financemanager/core/money so mobile can share
// it. This file is now just the web app's Tailwind class helper.

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
