"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";

function revalidate() {
  revalidatePath("/investments");
  revalidatePath("/reports/month");
}

/**
 * Correct a sale with what was actually received (the broker's statement)
 * and when; it then stops being an estimate.
 */
export async function updateRealized(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  const proceeds = Number(String(formData.get("proceeds") ?? "").replace(/,/g, ""));
  if (!Number.isFinite(proceeds) || proceeds < 0) return { error: "Invalid amount" };
  const date = String(formData.get("soldAt") ?? "");
  const soldAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!soldAt || Number.isNaN(soldAt.getTime())) return { error: "Invalid date" };

  const res = await prisma.realizedGain.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { proceeds, soldAt, estimated: false },
  });
  if (res.count === 0) return { error: "Not found" };
  revalidate();
  return { ok: true };
}

/** A sale that did not happen (a transfer out of the broker, say). The holding is not restored. */
export async function deleteRealized(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  await prisma.realizedGain.deleteMany({ where: { id: String(formData.get("id")), householdId: ctx.householdId } });
  revalidate();
  return { ok: true };
}
