"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { newApiToken, retrySmsMessage } from "@/lib/sms";
import { getT } from "@/lib/i18n/server";

function revalidateReview() {
  // The nav badge counts review items, and it lives in the shared layout.
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Device keys for the iOS shortcut
// ---------------------------------------------------------------------------

export async function createSmsToken(
  formData: FormData,
): Promise<{ token?: string; error?: string }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "iPhone";
  const { token, tokenHash, prefix } = newApiToken();
  await prisma.apiToken.create({
    data: { householdId: ctx.householdId, userId: ctx.userId, name, tokenHash, prefix },
  });
  revalidatePath("/settings");
  // Returned exactly once; only the hash is stored.
  return { token };
}

export async function revokeSmsToken(formData: FormData): Promise<void> {
  const { ctx } = await checkHousehold("MEMBER");
  if (!ctx) return;
  await prisma.apiToken.deleteMany({
    where: { id: String(formData.get("id")), householdId: ctx.householdId },
  });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Reviewing booked SMS transactions
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

/**
 * Say what an SMS transaction was: a category, or a transfer to one of the
 * household's own accounts. `choice` is a category id, or "transfer:<accountId>".
 *
 * A transfer between own accounts arrives as two messages — money out of one,
 * into the other — and booking both as expense + income would inflate both
 * totals. Marking one side as a transfer removes the other side if it is also
 * still waiting for review.
 */
export async function confirmSmsTransaction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const t = await getT();

  const id = String(formData.get("id"));
  const choice = String(formData.get("choice") ?? "");
  const description = String(formData.get("description") ?? "").trim().slice(0, 200) || null;

  const txn = await prisma.transaction.findFirst({
    where: { id, householdId: ctx.householdId, needsReview: true },
  });
  if (!txn) return { error: t("sms.err.notFound") };

  if (choice.startsWith("transfer:")) {
    const otherId = choice.slice("transfer:".length);
    const other = await prisma.account.findFirst({
      where: { id: otherId, householdId: ctx.householdId },
    });
    if (!other || other.id === txn.accountId) return { error: t("sms.err.notFound") };
    if (other.currency !== txn.currency) return { error: t("sms.err.transferCurrency") };

    // Money left txn.accountId (EXPENSE) or arrived there (INCOME).
    const from = txn.type === "EXPENSE" ? txn.accountId : other.id;
    const to = txn.type === "EXPENSE" ? other.id : txn.accountId;
    const counterpartType = txn.type === "EXPENSE" ? "INCOME" : "EXPENSE";

    await prisma.$transaction(async (tx) => {
      const counterpart = await tx.transaction.findFirst({
        where: {
          householdId: ctx.householdId,
          id: { not: txn.id },
          accountId: other.id,
          type: counterpartType,
          needsReview: true,
          origin: "SMS",
          amount: txn.amount,
          date: { gte: new Date(txn.date.getTime() - 3 * DAY), lte: new Date(txn.date.getTime() + 3 * DAY) },
        },
        orderBy: { date: "asc" },
      });
      if (counterpart) await tx.transaction.delete({ where: { id: counterpart.id } });
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          type: "TRANSFER",
          accountId: from,
          transferAccountId: to,
          categoryId: null,
          description,
          needsReview: false,
        },
      });
    });
  } else {
    const category = await prisma.category.findFirst({
      where: { id: choice, householdId: ctx.householdId, type: txn.type },
    });
    if (!category) return { error: t("sms.err.pickCategory") };
    await prisma.transaction.update({
      where: { id: txn.id },
      data: { categoryId: category.id, description, needsReview: false },
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
  revalidatePath("/accounts");
  revalidateReview();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Messages that could not be booked
// ---------------------------------------------------------------------------

export async function retrySms(formData: FormData): Promise<void> {
  const { ctx } = await checkHousehold("MEMBER");
  if (!ctx) return;
  await retrySmsMessage({ householdId: ctx.householdId, userId: ctx.userId }, String(formData.get("id")));
  revalidatePath("/transactions");
  revalidateReview();
}

export async function dismissSms(formData: FormData): Promise<void> {
  const { ctx } = await checkHousehold("MEMBER");
  if (!ctx) return;
  await prisma.smsMessage.updateMany({
    where: {
      id: String(formData.get("id")),
      householdId: ctx.householdId,
      status: { in: ["UNPARSED", "UNMATCHED"] },
    },
    data: { status: "DISMISSED" },
  });
  revalidateReview();
}
