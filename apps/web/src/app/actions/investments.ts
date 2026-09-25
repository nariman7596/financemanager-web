"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { investmentSchema } from "@financemanager/core/validation";
import { toNumber } from "@financemanager/core/money";
import { refreshIranPrices } from "@/lib/iranMarket";
import { refreshTgjuPrices } from "@/lib/tgju";
import { tgjuItem } from "@financemanager/core/market";

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

/**
 * Gold, coins and foreign cash follow a tgju price (`priceSource`), which
 * must be an item of the holding's type; their price is toman, so the
 * holding is kept in toman (or rial). Undefined when the source is not one.
 */
function priceSourceFrom(formData: FormData, type: string, currency: string): string | null | undefined {
  const raw = String(formData.get("priceSource") ?? "");
  if (type !== "GOLD" && type !== "FX") return null;
  const item = tgjuItem(raw);
  if (!item || item.type !== type) return undefined;
  if (currency !== "IRT" && currency !== "IRR") return undefined;
  return raw;
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

/**
 * A coin priced in toman gets its price now, not at the next hourly refresh —
 * until then it would read as worth nothing. A failure leaves it for the
 * Refresh button or the cron.
 */
async function priceNow(data: { type: string; currency: string }, householdId: string) {
  if (data.currency !== "IRT" && data.currency !== "IRR") return;
  if (data.type === "CRYPTO") await refreshIranPrices(householdId).catch(() => undefined);
  if (data.type === "GOLD" || data.type === "FX") await refreshTgjuPrices(householdId).catch(() => undefined);
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
  const priceSource = priceSourceFrom(formData, parsed.data.type, parsed.data.currency);
  if (priceSource === undefined) return { error: "Pick the item, priced in toman or rial" };

  await prisma.investment.create({
    data: { ...parsed.data, heldForId, priceSource, householdId: ctx.householdId, createdById: ctx.userId },
  });
  await priceNow(parsed.data, ctx.householdId);
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
  const priceSource = priceSourceFrom(formData, parsed.data.type, parsed.data.currency);
  if (priceSource === undefined) return { error: "Pick the item, priced in toman or rial" };

  const res = await prisma.investment.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { ...parsed.data, heldForId, priceSource },
  });
  if (res.count === 0) return { error: "Not found" };
  await priceNow(parsed.data, ctx.householdId);
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
