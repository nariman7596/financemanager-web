"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { budgetSchema } from "@/lib/validation";

export async function upsertBudget(formData: FormData) {
  const user = await requireUser();
  const parsed = budgetSchema.safeParse({
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    period: formData.get("period") || "MONTHLY",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  // Confirm the category is the user's.
  const cat = await prisma.category.findFirst({
    where: { id: d.categoryId, userId: user.userId },
  });
  if (!cat) return { error: "Invalid category" };

  await prisma.budget.upsert({
    where: {
      userId_categoryId_period: {
        userId: user.userId,
        categoryId: d.categoryId,
        period: d.period,
      },
    },
    create: { ...d, userId: user.userId },
    update: { amount: d.amount, currency: d.currency },
  });

  revalidatePath("/budgets");
  return { ok: true };
}

export async function deleteBudget(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.budget.deleteMany({ where: { id, userId: user.userId } });
  revalidatePath("/budgets");
  return { ok: true };
}
