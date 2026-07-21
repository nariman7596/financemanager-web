"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { transactionSchema } from "@/lib/validation";

export async function createTransaction(formData: FormData) {
  const user = await requireUser();
  const parsed = transactionSchema.safeParse({
    type: formData.get("type"),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
    transferAccountId: formData.get("transferAccountId") || null,
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    date: formData.get("date"),
    description: formData.get("description") || null,
    notes: formData.get("notes") || null,
    isRecurring: formData.get("isRecurring") === "on",
    recurrence: formData.get("recurrence") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const d = parsed.data;
  // Verify the account(s) belong to this user.
  const owned = await prisma.account.count({
    where: {
      userId: user.userId,
      id: { in: [d.accountId, d.transferAccountId].filter(Boolean) as string[] },
    },
  });
  const expected = d.type === "TRANSFER" ? 2 : 1;
  if (owned < expected) return { error: "Invalid account" };

  await prisma.transaction.create({
    data: {
      userId: user.userId,
      accountId: d.accountId,
      categoryId: d.type === "TRANSFER" ? null : d.categoryId ?? null,
      transferAccountId: d.type === "TRANSFER" ? d.transferAccountId : null,
      type: d.type,
      amount: d.amount,
      currency: d.currency,
      date: d.date,
      description: d.description ?? null,
      notes: d.notes ?? null,
      isRecurring: d.isRecurring,
      recurrence: d.isRecurring ? d.recurrence ?? null : null,
    },
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
  return { ok: true };
}

export async function deleteTransaction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.transaction.deleteMany({ where: { id, userId: user.userId } });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
  return { ok: true };
}
