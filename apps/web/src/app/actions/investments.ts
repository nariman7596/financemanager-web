"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { investmentSchema } from "@financemanager/core/validation";
import { toNumber } from "@financemanager/core/money";

/**
 * The person a holding is kept for: empty means the household's own, else a
 * PERSON account of this household. Undefined when the id is not one.
 */
async function heldForFrom(formData: FormData, householdId: string): Promise<string | null | undefined> {
  const id = String(formData.get("heldForId") ?? "");
  if (!id) return null;
  const person = await prisma.account.findFirst({
    where: { id, householdId, type: "PERSON" },
    select: { id: true },
  });
  return person?.id;
}

function parseInvestment(formData: FormData) {
  return investmentSchema.safeParse({
    symbol: formData.get("symbol"),
    name: formData.get("name"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    costBasis: formData.get("costBasis"),
    currentPrice: formData.get("currentPrice") || 0,
    currency: formData.get("currency"),
    purchaseDate: formData.get("purchaseDate"),
  });
}

function revalidate() {
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

export async function createInvestment(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

  const parsed = parseInvestment(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const heldForId = await heldForFrom(formData, ctx.householdId);
  if (heldForId === undefined) return { error: "Unknown person" };

  await prisma.investment.create({
    data: { ...parsed.data, heldForId, householdId: ctx.householdId, createdById: ctx.userId },
  });
  revalidate();
  return { ok: true };
}

export async function updateInvestment(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));

  const parsed = parseInvestment(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const heldForId = await heldForFrom(formData, ctx.householdId);
  if (heldForId === undefined) return { error: "Unknown person" };

  const res = await prisma.investment.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { ...parsed.data, heldForId },
  });
  if (res.count === 0) return { error: "Not found" };
  revalidate();
  return { ok: true };
}

/**
 * Part (or all) of a holding sold: the quantity goes down and the cost basis
 * with it, in proportion, so the gain left on the rest stays true. Selling
 * everything removes the holding. Where the money went is booked on its own —
 * the bank SMS of the deposit, filed in Review ("transfer ↔ person" for a
 * holding kept for someone).
 */
export async function sellInvestment(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  const sold = Number(formData.get("quantity"));
  if (!Number.isFinite(sold) || sold <= 0) return { error: "Invalid quantity" };

  const h = await prisma.investment.findFirst({
    where: { id, householdId: ctx.householdId },
    select: { quantity: true, costBasis: true },
  });
  if (!h) return { error: "Not found" };
  const qty = toNumber(h.quantity);
  // A hair over the holding (a typed-in rounding) sells all of it.
  if (sold >= qty * (1 - 1e-9)) {
    await prisma.investment.delete({ where: { id } });
  } else {
    const left = qty - sold;
    await prisma.investment.update({
      where: { id },
      data: { quantity: left, costBasis: (toNumber(h.costBasis) * left) / qty },
    });
  }
  revalidate();
  return { ok: true };
}

export async function updatePrice(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  const price = Number(formData.get("currentPrice"));
  if (!Number.isFinite(price) || price < 0) return { error: "Invalid price" };

  await prisma.investment.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { currentPrice: price },
  });
  revalidate();
  return { ok: true };
}

export async function deleteInvestment(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.investment.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidate();
  return { ok: true };
}
