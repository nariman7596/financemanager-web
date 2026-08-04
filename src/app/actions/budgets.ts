"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { budgetSchema } from "@/lib/validation";
import { getT } from "@/lib/i18n/server";

export async function upsertBudget(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const t = await getT();

  const parsed = budgetSchema.safeParse({
    categoryId: formData.get("categoryId"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    period: formData.get("period") || "MONTHLY",
  });
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "valid.invalid") };
  const d = parsed.data;

  const cat = await prisma.category.findFirst({
    where: { id: d.categoryId, householdId: ctx.householdId },
  });
  if (!cat) return { error: t("err.invalidCategory") };

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
