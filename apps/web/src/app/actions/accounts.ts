"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@financemanager/db";
import { checkHousehold } from "@/lib/household";
import { accountSchema } from "@financemanager/core/validation";

export async function createAccount(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    openingBalance: formData.get("openingBalance") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await prisma.account.create({
    data: { ...parsed.data, householdId: ctx.householdId, createdById: ctx.userId },
  });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteAccount(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.account.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function archiveAccount(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.account.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { isArchived: true },
  });
  revalidatePath("/accounts");
  return { ok: true };
}
