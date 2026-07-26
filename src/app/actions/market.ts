"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { refreshAll, type RefreshSummary } from "@/lib/marketdata";

/**
 * Manual "refresh now" triggered from the UI. Updates FX rates (global) and
 * the current user's investment prices, then revalidates the money views.
 */
export async function refreshMarketData(): Promise<RefreshSummary> {
  const user = await requireUser();
  const summary = await refreshAll(user.userId);
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return summary;
}
