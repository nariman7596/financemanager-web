"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { goalContributionSchema, goalSchema } from "@financemanager/core/validation";

function revalidate() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/budgets/plan");
}

/**
 * Read the form; for a LINKED goal keep only accounts and holdings of this
 * household that can hold savings (not a person's or a loan, not a holding
 * kept for someone else). A LINKED goal with nothing linked is refused.
 */
async function parseGoal(formData: FormData, householdId: string) {
  const parsed = goalSchema.safeParse({
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
    currency: formData.get("currency"),
    targetDate: formData.get("targetDate"),
    source: formData.get("source"),
    accountIds: formData.getAll("accountIds").map(String),
    investmentIds: formData.getAll("investmentIds").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid goal" };
  const d = parsed.data;
  if (d.source === "MANUAL") return { data: { ...d, accountIds: [], investmentIds: [] } };

  const [accounts, holdings] = await Promise.all([
    prisma.account.findMany({
      where: { householdId, id: { in: d.accountIds }, type: { notIn: ["PERSON", "LOAN"] } },
      select: { id: true },
    }),
    prisma.investment.findMany({
      where: { householdId, id: { in: d.investmentIds }, heldForId: null },
      select: { id: true },
    }),
  ]);
  if (accounts.length + holdings.length === 0) return { error: "Pick at least one account or holding" };
  return { data: { ...d, accountIds: accounts.map((a) => a.id), investmentIds: holdings.map((h) => h.id) } };
}

export async function createGoal(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const r = await parseGoal(formData, ctx.householdId);
  if ("error" in r) return { error: r.error };
  await prisma.goal.create({ data: { ...r.data, householdId: ctx.householdId, createdById: ctx.userId } });
  revalidate();
  return { ok: true };
}

export async function updateGoal(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  const r = await parseGoal(formData, ctx.householdId);
  if ("error" in r) return { error: r.error };
  const res = await prisma.goal.updateMany({ where: { id, householdId: ctx.householdId }, data: r.data });
  if (res.count === 0) return { error: "Not found" };
  revalidate();
  return { ok: true };
}

export async function deleteGoal(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  await prisma.goal.deleteMany({ where: { id: String(formData.get("id")), householdId: ctx.householdId } });
  revalidate();
  return { ok: true };
}

/** Set money aside for a MANUAL goal (or take some back with a negative amount). */
export async function addGoalContribution(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const goal = await prisma.goal.findFirst({
    where: { id: String(formData.get("goalId")), householdId: ctx.householdId, source: "MANUAL" },
    select: { id: true },
  });
  if (!goal) return { error: "Not found" };
  const parsed = goalContributionSchema.safeParse({
    amount: formData.get("amount"),
    date: formData.get("date") || new Date(),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await prisma.goalContribution.create({ data: { ...parsed.data, goalId: goal.id } });
  revalidate();
  return { ok: true };
}
