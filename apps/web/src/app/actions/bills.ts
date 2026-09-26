"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { normalizeRuleMatch } from "@financemanager/core/sms";
import { CURRENCY_CODES } from "@financemanager/core/constants";

function revalidate() {
  revalidatePath("/bills");
  revalidatePath("/dashboard");
}

/**
 * The bill in the form, checked against this household: the loan and the
 * category must be its own, a description is stored in the form it is
 * compared in.
 */
async function parseBill(formData: FormData, householdId: string) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const amount = Number(formData.get("amount"));
  const currency = String(formData.get("currency") ?? "");
  const dueDay = Number(formData.get("dueDay"));
  const leadDays = Number(formData.get("leadDays") ?? 3);
  const matchKind = String(formData.get("matchKind") ?? "");
  let matchValue = String(formData.get(`match_${matchKind}`) ?? formData.get("matchValue") ?? "").trim();
  if (!name) return { error: "Name is required" };
  if (!Number.isFinite(amount) || amount < 0) return { error: "Invalid amount" };
  if (!(CURRENCY_CODES as readonly string[]).includes(currency)) return { error: "Invalid currency" };
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return { error: "Invalid day" };
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 15) return { error: "Invalid reminder days" };
  if (matchKind === "LOAN") {
    const a = await prisma.account.findFirst({ where: { id: matchValue, householdId, type: "LOAN" }, select: { id: true } });
    if (!a) return { error: "Pick the loan" };
  } else if (matchKind === "CATEGORY") {
    const c = await prisma.category.findFirst({ where: { id: matchValue, householdId }, select: { id: true } });
    if (!c) return { error: "Pick the category" };
  } else if (matchKind === "DESCRIPTION") {
    matchValue = normalizeRuleMatch(matchValue);
    if (matchValue.length < 2) return { error: "Enter the text of the payment" };
  } else return { error: "Pick how the payment is recognised" };
  return { data: { name, amount, currency, dueDay, leadDays, matchKind, matchValue } };
}

export async function saveBill(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const r = await parseBill(formData, ctx.householdId);
  if ("error" in r) return { error: r.error };
  const id = String(formData.get("id") ?? "");
  if (id) {
    const res = await prisma.bill.updateMany({ where: { id, householdId: ctx.householdId }, data: { ...r.data, active: true } });
    if (res.count === 0) return { error: "Not found" };
  } else {
    await prisma.bill.create({ data: { ...r.data, householdId: ctx.householdId, createdById: ctx.userId } });
  }
  revalidate();
  return { ok: true };
}

/** A suggestion turned down: kept as a paused bill so it is not suggested again. */
export async function dismissBillSuggestion(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const r = await parseBill(formData, ctx.householdId);
  if ("error" in r) return { error: r.error };
  await prisma.bill.create({ data: { ...r.data, active: false, householdId: ctx.householdId, createdById: ctx.userId } });
  revalidate();
  return { ok: true };
}

export async function setBillActive(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  await prisma.bill.updateMany({
    where: { id: String(formData.get("id")), householdId: ctx.householdId },
    data: { active: formData.get("active") === "1" },
  });
  revalidate();
  return { ok: true };
}

export async function deleteBill(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  await prisma.bill.deleteMany({ where: { id: String(formData.get("id")), householdId: ctx.householdId } });
  revalidate();
  return { ok: true };
}
