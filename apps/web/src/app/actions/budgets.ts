"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { z } from "zod";
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

const planSchema = z.object({
  savingsRate: z.number().min(0).max(1),
  rent: z.number().min(0),
  otherFixed: z.number().min(0),
  protectedIds: z.array(z.string()).max(100),
  rows: z
    .array(
      z.object({
        categoryId: z.string(),
        period: z.enum(["WEEKLY", "MONTHLY"]),
        amount: z.number().min(0),
      }),
    )
    .max(200),
});

/**
 * Save what the budget planner proposed (as edited): one budget per category,
 * weekly or monthly, replacing that category's budgets for any other period.
 * A row at 0 removes the category's budget. Categories not in the plan keep
 * whatever they had. The planner's inputs are kept for next month.
 */
export async function applyBudgetPlan(json: string): Promise<{ ok?: true; count?: number; error?: string }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  let parsed;
  try {
    parsed = planSchema.safeParse(JSON.parse(json));
  } catch {
    return { error: "Invalid plan" };
  }
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const plan = parsed.data;

  const household = await prisma.household.findUnique({
    where: { id: ctx.householdId },
    select: { baseCurrency: true },
  });
  const valid = new Set(
    (
      await prisma.category.findMany({
        where: { householdId: ctx.householdId, type: "EXPENSE", id: { in: plan.rows.map((r) => r.categoryId) } },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const rows = plan.rows.filter((r) => valid.has(r.categoryId));
  const currency = household?.baseCurrency ?? "USD";

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.budget.deleteMany({
        where: {
          householdId: ctx.householdId,
          categoryId: r.categoryId,
          ...(r.amount > 0 ? { period: { not: r.period } } : {}),
        },
      });
      if (r.amount <= 0) continue;
      await tx.budget.upsert({
        where: {
          householdId_categoryId_period: { householdId: ctx.householdId, categoryId: r.categoryId, period: r.period },
        },
        create: {
          householdId: ctx.householdId,
          createdById: ctx.userId,
          categoryId: r.categoryId,
          period: r.period,
          amount: r.amount,
          currency,
        },
        update: { amount: r.amount, currency },
      });
    }
    await tx.household.update({
      where: { id: ctx.householdId },
      data: {
        budgetPlan: {
          savingsRate: plan.savingsRate,
          rent: plan.rent,
          otherFixed: plan.otherFixed,
          protectedIds: plan.protectedIds,
        },
      },
    });
  });
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return { ok: true, count: rows.filter((r) => r.amount > 0).length };
}
