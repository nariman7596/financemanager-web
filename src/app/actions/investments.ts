"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { investmentSchema } from "@/lib/validation";
import { getT } from "@/lib/i18n/server";

export async function createInvestment(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

  const parsed = investmentSchema.safeParse({
    symbol: formData.get("symbol"),
    name: formData.get("name"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    costBasis: formData.get("costBasis"),
    currentPrice: formData.get("currentPrice") || 0,
    currency: formData.get("currency"),
    purchaseDate: formData.get("purchaseDate"),
  });
  if (!parsed.success) {
    const t = await getT();
    return { error: t(parsed.error.issues[0]?.message ?? "valid.invalid") };
  }

  await prisma.investment.create({
    data: { ...parsed.data, householdId: ctx.householdId, createdById: ctx.userId },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updatePrice(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  const price = Number(formData.get("currentPrice"));
  if (!Number.isFinite(price) || price < 0) {
    const t = await getT();
    return { error: t("err.invalidPrice") };
  }

  await prisma.investment.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { currentPrice: price },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInvestment(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.investment.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}
