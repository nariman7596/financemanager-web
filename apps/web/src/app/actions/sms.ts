"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { ingestSmsBatch, newApiToken, retrySmsMessage, type BatchSummary } from "@/lib/sms";
import { getT } from "@/lib/i18n/server";
import { SMS_BATCH_SEPARATOR, canMakeRule, normalizeRuleMatch } from "@financemanager/core/sms";

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

    // "Always file this as that": keyed on the description the SMS produced,
    // not the one just typed — the next SMS from this merchant will carry the
    // bank's wording again.
    if (formData.get("remember") === "1" && canMakeRule(txn.description)) {
      const match = normalizeRuleMatch(txn.description!);
      await prisma.categoryRule.upsert({
        where: { householdId_type_match: { householdId: ctx.householdId, type: txn.type, match } },
        create: { householdId: ctx.householdId, createdById: ctx.userId, type: txn.type, match, categoryId: category.id },
        update: { categoryId: category.id },
      });
      // Rows from the same merchant already waiting here are filed too.
      const waiting = await prisma.transaction.findMany({
        where: { householdId: ctx.householdId, needsReview: true, type: txn.type, origin: "SMS" },
        select: { id: true, description: true },
      });
      const same = waiting
        .filter((w) => w.description && normalizeRuleMatch(w.description) === match)
        .map((w) => w.id);
      if (same.length > 0) {
        await prisma.transaction.updateMany({
          where: { id: { in: same }, householdId: ctx.householdId },
          data: { categoryId: category.id, needsReview: false },
        });
      }
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
  revalidatePath("/accounts");
  revalidateReview();
  return { ok: true };
}

/** Forget a category rule; later SMS from that merchant wait in Review again. */
export async function deleteCategoryRule(formData: FormData): Promise<void> {
  const { ctx } = await checkHousehold("MEMBER");
  if (!ctx) return;
  await prisma.categoryRule.deleteMany({
    where: { id: String(formData.get("id")), householdId: ctx.householdId },
  });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Pasting a message by hand
// ---------------------------------------------------------------------------

/**
 * Import bank SMS the shortcut never delivered — iOS sometimes simply does not
 * run the automation. Same path as /api/ingest/sms: parsed, matched, stored
 * once by hash (pasting one that did arrive is a harmless duplicate), and
 * booked for review. Several messages can be pasted separated by a blank line
 * or the shortcut's ~~~fm~~~ marker.
 */
export async function pasteSms(
  formData: FormData,
): Promise<{ summary?: BatchSummary; error?: string }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  // CRLF from the textarea → LF, so the stored body reads like a delivered one.
  const text = String(formData.get("text") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 20_000);
  if (!text) return { error: (await getT())("sms.paste.empty") };

  const summary = await ingestSmsBatch(
    { householdId: ctx.householdId, userId: ctx.userId },
    splitPasted(text),
  );
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidateReview();
  return { summary };
}

/**
 * A paste of several messages, as a batch the ingest splitter understands.
 * Bank SMS never contain a blank line, so one between blocks separates them.
 */
function splitPasted(text: string): string {
  if (text.includes(SMS_BATCH_SEPARATOR)) return text;
  return text.split(/\n\s*\n/).join(`\n${SMS_BATCH_SEPARATOR}\n`);
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
