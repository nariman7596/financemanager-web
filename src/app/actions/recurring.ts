"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recurringSchema } from "@/lib/validation";
import { postDueRecurring } from "@/lib/recurring";

function revalidateMoney() {
  revalidatePath("/recurring");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

export async function createRecurring(formData: FormData) {
  const user = await requireUser();
  const parsed = recurringSchema.safeParse({
    type: formData.get("type"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
    transferAccountId: formData.get("transferAccountId") || null,
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    description: formData.get("description") || null,
    frequency: formData.get("frequency"),
    interval: formData.get("interval") || 1,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  // Verify account ownership.
  const owned = await prisma.account.count({
    where: {
      userId: user.userId,
      id: { in: [d.accountId, d.transferAccountId].filter(Boolean) as string[] },
    },
  });
  const expected = d.type === "TRANSFER" ? 2 : 1;
  if (owned < expected) return { error: "Invalid account" };

  await prisma.recurringTransaction.create({
    data: {
      userId: user.userId,
      accountId: d.accountId,
      categoryId: d.type === "TRANSFER" ? null : d.categoryId ?? null,
      transferAccountId: d.type === "TRANSFER" ? d.transferAccountId : null,
      type: d.type,
      amount: d.amount,
      currency: d.currency,
      description: d.description ?? null,
      frequency: d.frequency,
      interval: d.interval,
      startDate: d.startDate,
      nextRunDate: d.startDate, // first run is the start date
      endDate: d.endDate ?? null,
    },
  });

  // Immediately post any occurrences that are already due (start date in past).
  await postDueRecurring(user.userId);
  revalidateMoney();
  return { ok: true };
}

export async function toggleRecurring(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const rule = await prisma.recurringTransaction.findFirst({
    where: { id, userId: user.userId },
    select: { isActive: true },
  });
  if (!rule) return { error: "Not found" };
  await prisma.recurringTransaction.updateMany({
    where: { id, userId: user.userId },
    data: { isActive: !rule.isActive },
  });
  revalidatePath("/recurring");
  return { ok: true };
}

export async function deleteRecurring(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  // Keep already-posted transactions (schema sets their recurringId to null).
  await prisma.recurringTransaction.deleteMany({ where: { id, userId: user.userId } });
  revalidatePath("/recurring");
  return { ok: true };
}

/** Manually post everything due for the current user right now. */
export async function runRecurringNow() {
  const user = await requireUser();
  const summary = await postDueRecurring(user.userId);
  revalidateMoney();
  return summary;
}
