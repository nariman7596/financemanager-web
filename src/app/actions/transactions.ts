"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { transactionSchema } from "@/lib/validation";
import { getT } from "@/lib/i18n/server";

function parse(formData: FormData) {
  return transactionSchema.safeParse({
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
}

function revalidateMoney() {
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

export async function createTransaction(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

  const t = await getT();
  const parsed = parse(formData);
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "valid.invalid") };
  const d = parsed.data;

  // Verify the account(s) belong to this household.
  const owned = await prisma.account.count({
    where: {
      householdId: ctx.householdId,
      id: { in: [d.accountId, d.transferAccountId].filter(Boolean) as string[] },
    },
  });
  if (owned < (d.type === "TRANSFER" ? 2 : 1)) return { error: t("err.invalidAccount") };

  await prisma.transaction.create({
    data: {
      householdId: ctx.householdId,
      createdById: ctx.userId,
      accountId: d.accountId,
      categoryId: d.type === "TRANSFER" ? null : d.categoryId ?? null,
      transferAccountId: d.type === "TRANSFER" ? d.transferAccountId : null,
      type: d.type,
      amount: d.amount,
      currency: d.currency,
      date: d.date,
      description: d.description ?? null,
      notes: d.notes ?? null,
    },
  });
  revalidateMoney();
  return { ok: true };
}

export async function updateTransaction(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const t = await getT();
  const id = String(formData.get("id"));

  const existing = await prisma.transaction.findFirst({
    where: { id, householdId: ctx.householdId },
    select: { id: true },
  });
  if (!existing) return { error: t("err.transactionNotFound") };

  const parsed = parse(formData);
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "valid.invalid") };
  const d = parsed.data;

  const owned = await prisma.account.count({
    where: {
      householdId: ctx.householdId,
      id: { in: [d.accountId, d.transferAccountId].filter(Boolean) as string[] },
    },
  });
  if (owned < (d.type === "TRANSFER" ? 2 : 1)) return { error: t("err.invalidAccount") };

  await prisma.transaction.update({
    where: { id },
    data: {
      accountId: d.accountId,
      categoryId: d.type === "TRANSFER" ? null : d.categoryId ?? null,
      transferAccountId: d.type === "TRANSFER" ? d.transferAccountId : null,
      type: d.type,
      amount: d.amount,
      currency: d.currency,
      date: d.date,
      description: d.description ?? null,
      notes: d.notes ?? null,
    },
  });
  revalidateMoney();
  return { ok: true };
}

export async function deleteTransaction(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.transaction.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidateMoney();
  return { ok: true };
}
