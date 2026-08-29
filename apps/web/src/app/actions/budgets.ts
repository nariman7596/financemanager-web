"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@financemanager/db";
import { checkHousehold } from "@/lib/household";
import { budgetSchema } from "@financemanager/core/validation";

export async function upsertBudget(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

  const parsed = budgetSchema.safeParse({
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    period: formData.get("period") || "MONTHLY",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const cat = await prisma.category.findFirst({
    where: { id: d.categoryId, householdId: ctx.householdId },
  });
  if (!cat) return { error: "Invalid category" };

  await prisma.budget.upsert({
    where: {
      householdId_categoryId_period: {
        householdId: ctx.householdId,
        categoryId: d.categoryId,
        period: d.period,
      },
    },
    create: { ...d, householdId: ctx.householdId, createdById: ctx.userId },
    update: { amount: d.amount, currency: d.currency },
  });
  revalidatePath("/budgets");
  return { ok: true };
}

export async function deleteBudget(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.budget.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidatePath("/budgets");
  return { ok: true };
}
