"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@financemanager/db";
import { checkHousehold } from "@/lib/household";
import { recurringSchema } from "@financemanager/core/validation";
import { postDueRecurring } from "@/lib/recurring";
import { getLocale } from "@/lib/i18n/server";
import { calendarForLocale } from "@financemanager/core/calendar";

function revalidateMoney() {
  revalidatePath("/recurring");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

export async function createRecurring(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

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

  const owned = await prisma.account.count({
    where: {
      householdId: ctx.householdId,
      id: { in: [d.accountId, d.transferAccountId].filter(Boolean) as string[] },
    },
  });
  if (owned < (d.type === "TRANSFER" ? 2 : 1)) return { error: "Invalid account" };

  await prisma.recurringTransaction.create({
    data: {
      householdId: ctx.householdId,
      createdById: ctx.userId,
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
      nextRunDate: d.startDate,
      endDate: d.endDate ?? null,
      // Frozen at creation: a Persian owner means "the 15th of every Jalali
      // month". Storing it here keeps a later language switch from moving
      // money that is already scheduled.
      calendar: calendarForLocale(await getLocale()),
    },
  });

  await postDueRecurring(ctx.householdId);
  revalidateMoney();
  return { ok: true };
}

export async function updateRecurring(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));

  const existing = await prisma.recurringTransaction.findFirst({
    where: { id, householdId: ctx.householdId },
  });
  if (!existing) return { error: "Rule not found" };

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

  const owned = await prisma.account.count({
    where: {
      householdId: ctx.householdId,
      id: { in: [d.accountId, d.transferAccountId].filter(Boolean) as string[] },
    },
  });
  if (owned < (d.type === "TRANSFER" ? 2 : 1)) return { error: "Invalid account" };

  // If nothing has posted yet, the schedule cursor follows the (possibly new)
  // start date; once it's begun posting, keep the existing cursor.
  const nextRunDate = existing.lastPosted ? existing.nextRunDate : d.startDate;

  await prisma.recurringTransaction.update({
    where: { id },
    data: {
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
      nextRunDate,
      endDate: d.endDate ?? null,
    },
  });

  // Edits can make an occurrence due right away (e.g. a past start date).
  await postDueRecurring(ctx.householdId);
  revalidateMoney();
  return { ok: true };
}

export async function toggleRecurring(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  const rule = await prisma.recurringTransaction.findFirst({
    where: { id, householdId: ctx.householdId },
    select: { isActive: true },
  });
  if (!rule) return { error: "Not found" };
  await prisma.recurringTransaction.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { isActive: !rule.isActive },
  });
  revalidatePath("/recurring");
  return { ok: true };
}

export async function deleteRecurring(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.recurringTransaction.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidatePath("/recurring");
  return { ok: true };
}

export async function runRecurringNow() {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { rules: 0, posted: 0, error };
  const summary = await postDueRecurring(ctx.householdId);
  revalidateMoney();
  return summary;
}
