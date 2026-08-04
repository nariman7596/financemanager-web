"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { categorySchema } from "@/lib/validation";
import { getT } from "@/lib/i18n/server";

export async function createCategory(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const t = await getT();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color") || "#328eff",
  });
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "valid.invalid") };

  try {
    await prisma.category.create({
      data: { ...parsed.data, householdId: ctx.householdId, createdById: ctx.userId },
    });
  } catch {
    return { error: t("err.categoryDuplicate") };
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
