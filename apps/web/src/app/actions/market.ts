"use server";

import { revalidatePath } from "next/cache";
import { checkHousehold } from "@/lib/household";
import { refreshAll, type RefreshSummary } from "@/lib/marketdata";

/**
 * Manual "refresh now" from the UI. Updates FX rates (global) and the active
 * household's investment prices, then revalidates the money views.
 */
export async function refreshMarketData(): Promise<RefreshSummary> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) {
    return { fx: { updated: 0, error }, prices: { updated: 0, skipped: 0 }, at: new Date().toISOString() };
  }
  const summary = await refreshAll(ctx.householdId);
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return summary;
}
