"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { investmentSchema } from "@/lib/validation";

export async function createInvestment(formData: FormData) {
  const user = await requireUser();
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await prisma.investment.create({
    data: { ...parsed.data, userId: user.userId },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updatePrice(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const price = Number(formData.get("currentPrice"));
  if (!Number.isFinite(price) || price < 0) return { error: "Invalid price" };

  await prisma.investment.updateMany({
    where: { id, userId: user.userId },
    data: { currentPrice: price },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInvestment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.investment.deleteMany({ where: { id, userId: user.userId } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}
