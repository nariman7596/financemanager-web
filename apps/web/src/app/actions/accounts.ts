"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { accountSchema } from "@financemanager/core/validation";
import { rialTomanRescale } from "@financemanager/core/currency";
import { normalizeSmsMatch } from "@financemanager/core/sms";
import { retryUnmatched } from "@/lib/sms";
import { getT } from "@/lib/i18n/server";

export async function createAccount(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    openingBalance: formData.get("openingBalance") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const sms = normalizeSmsMatch(String(formData.get("smsMatch") ?? ""));
  if ("error" in sms) return { error: (await getT())("sms.err.matchTooShort") };

  await prisma.account.create({
    data: { ...parsed.data, smsMatch: sms.value, householdId: ctx.householdId, createdById: ctx.userId },
  });
  if (sms.value) await retryUnmatched({ householdId: ctx.householdId, userId: ctx.userId });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Edit an account: name, type, currency, opening balance and the number its
 * bank prints in SMS.
 *
 * Changing the currency between rial and toman restates the account's whole
 * history by exactly 10 — opening balance, transactions, SMS-reported
 * balances, recurring rules — in one database transaction, so the balance
 * means the same money before and after. Any other currency change is only
 * allowed while the account has no history: it would need a market rate, and
 * rewriting past amounts at today's rate would change what they were worth.
 */
export async function updateAccount(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const t = await getT();

  const id = String(formData.get("id"));
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    openingBalance: formData.get("openingBalance") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const sms = normalizeSmsMatch(String(formData.get("smsMatch") ?? ""));
  if ("error" in sms) return { error: t("sms.err.matchTooShort") };

  const account = await prisma.account.findFirst({ where: { id, householdId: ctx.householdId } });
  if (!account) return { error: t("sms.err.notFound") };

  const from = account.currency;
  const to = parsed.data.currency;
  const scale = from === to ? null : rialTomanRescale(from, to);
  const touching = { householdId: ctx.householdId, OR: [{ accountId: id }, { transferAccountId: id }] };

  if (from !== to) {
    const [txns, rules] = await Promise.all([
      prisma.transaction.findMany({ where: touching, select: { type: true, accountId: true, transferAccountId: true } }),
      prisma.recurringTransaction.findMany({ where: touching, select: { type: true, accountId: true, transferAccountId: true } }),
    ]);
    if (!scale && (txns.length > 0 || rules.length > 0)) return { error: t("accForm.err.currencyLocked") };

    // A transfer's amount counts on both of its accounts. Restating it is
    // only right if the other account already uses the new currency.
    const others = new Set(
      [...txns, ...rules]
        .filter((r) => r.type === "TRANSFER")
        .map((r) => (r.accountId === id ? r.transferAccountId : r.accountId))
        .filter((o): o is string => !!o && o !== id),
    );
    if (others.size > 0) {
      const clash = await prisma.account.findFirst({
        where: { id: { in: [...others] }, householdId: ctx.householdId, currency: { not: to } },
        select: { name: true },
      });
      if (clash) return { error: t("accForm.err.transferCurrency", { name: clash.name }) };
    }
  }

  // The form shows the opening balance in the old currency. Left untouched,
  // it is restated with everything else; edited, it is taken as typed.
  const typed = parsed.data.openingBalance;
  const unchanged = Math.abs(typed - Number(account.openingBalance)) < 1e-9;
  const openingBalance = scale && unchanged
    ? (scale.op === "divide" ? typed / scale.by : typed * scale.by)
    : typed;

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id },
      data: { ...parsed.data, openingBalance, smsMatch: sms.value },
    });
    if (scale) {
      const amount = { [scale.op]: scale.by };
      await tx.transaction.updateMany({
        where: { ...touching, currency: from },
        data: { amount, currency: to },
      });
      await tx.transaction.updateMany({
        where: { householdId: ctx.householdId, accountId: id, bankBalance: { not: null } },
        data: { bankBalance: amount },
      });
      await tx.recurringTransaction.updateMany({
        where: { ...touching, currency: from },
        data: { amount, currency: to },
      });
    }
  });

  // Messages that arrived before this account could be matched can book now.
  if (sms.value && sms.value !== account.smsMatch) {
    await retryUnmatched({ householdId: ctx.householdId, userId: ctx.userId });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAccount(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.account.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function archiveAccount(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.account.updateMany({
    where: { id, householdId: ctx.householdId },
    data: { isArchived: true },
  });
  revalidatePath("/accounts");
  return { ok: true };
}
