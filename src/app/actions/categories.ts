"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { categorySchema } from "@/lib/validation";

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color") || "#328eff",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    await prisma.category.create({ data: { ...parsed.data, userId: user.userId } });
  } catch {
    return { error: "You already have a category with that name and type" };
  }
  revalidatePath("/settings");
  revalidatePath("/budgets");
  return { ok: true };
}

export async function deleteCategory(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.category.deleteMany({ where: { id, userId: user.userId } });
  revalidatePath("/settings");
  return { ok: true };
}
