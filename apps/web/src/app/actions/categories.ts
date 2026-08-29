"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { categorySchema } from "@financemanager/core/validation";

export async function createCategory(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color") || "#328eff",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    await prisma.category.create({
      data: { ...parsed.data, householdId: ctx.householdId, createdById: ctx.userId },
    });
  } catch {
    return { error: "This household already has a category with that name and type" };
  }
  revalidatePath("/settings");
  revalidatePath("/budgets");
  return { ok: true };
}

export async function deleteCategory(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.category.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidatePath("/settings");
  return { ok: true };
}
