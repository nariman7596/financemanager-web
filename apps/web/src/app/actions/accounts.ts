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
 * Changing the currency between rial and toman restates history by exactly 10
 * — opening balance, transactions, SMS-reported balances, recurring rules — in
 * one database transaction, so every balance means the same money before and
 * after. A transfer counts on both of its accounts, so accounts linked by
 * transfers in the same old currency must move together: the first attempt
 * names them, and the change goes through once the user ticks "convert them
 * too". Any other currency change is only allowed while the account has no
 * history: it would need a market rate, and rewriting past amounts at today's
 * rate would change what they were worth.
 */
export async function updateAccount(
  formData: FormData,
): Promise<{ ok?: true; error?: string; linked?: string[] }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const t = await getT();
  const householdId = ctx.householdId;

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

  const account = await prisma.account.findFirst({ where: { id, householdId } });
  if (!account) return { error: t("sms.err.notFound") };

  const from = account.currency;
  const to = parsed.data.currency;
  const scale = from === to ? null : rialTomanRescale(from, to);
  const touching = (ids: string[]) => ({
    householdId,
    OR: [{ accountId: { in: ids } }, { transferAccountId: { in: ids } }],
  });

  // The accounts that must change currency together: this one plus every
  // account reachable through transfers that still uses the old currency.
  let group = [id];
  if (from !== to) {
    if (!scale) {
      const [n, m] = await Promise.all([
        prisma.transaction.count({ where: touching([id]) }),
        prisma.recurringTransaction.count({ where: touching([id]) }),
      ]);
      if (n + m > 0) return { error: t("accForm.err.currencyLocked") };
    } else {
      const seen = new Set([id]);
      let frontier = [id];
      while (frontier.length > 0) {
        const links = [
          ...(await prisma.transaction.findMany({
            where: { ...touching(frontier), type: "TRANSFER" },
            select: { accountId: true, transferAccountId: true },
          })),
          ...(await prisma.recurringTransaction.findMany({
            where: { ...touching(frontier), type: "TRANSFER" },
            select: { accountId: true, transferAccountId: true },
          })),
        ];
        const next = new Set<string>();
        for (const l of links) {
          for (const other of [l.accountId, l.transferAccountId]) {
            if (other && !seen.has(other)) next.add(other);
          }
        }
        if (next.size === 0) break;
        const others = await prisma.account.findMany({
          where: { id: { in: [...next] }, householdId },
          select: { id: true, name: true, currency: true },
        });
        frontier = [];
        for (const o of others) {
          if (o.currency === from) {
            seen.add(o.id);
            frontier.push(o.id);
          } else if (o.currency !== to) {
            // Linked to a third currency: no single factor restates it.
            return { error: t("accForm.err.transferCurrency", { name: o.name }) };
          }
        }
      }
      group = [...seen];
      if (group.length > 1 && formData.get("convertLinked") !== "1") {
        const linked = await prisma.account.findMany({
          where: { id: { in: group.filter((g) => g !== id) } },
          select: { name: true },
          orderBy: { name: "asc" },
        });
        const names = linked.map((l) => l.name);
        return { error: t("accForm.err.linked", { names: names.join("، ") }), linked: names };
      }
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
      const factor = { [scale.op]: scale.by };
      const linkedIds = group.filter((g) => g !== id);
      if (linkedIds.length > 0) {
        await tx.account.updateMany({
          where: { id: { in: linkedIds }, householdId },
          data: { openingBalance: factor, currency: to },
        });
      }
      await tx.transaction.updateMany({
        where: { ...touching(group), currency: from },
        data: { amount: factor, currency: to },
      });
      await tx.transaction.updateMany({
        where: { householdId, accountId: { in: group }, bankBalance: { not: null } },
        data: { bankBalance: factor },
      });
      await tx.recurringTransaction.updateMany({
        where: { ...touching(group), currency: from },
        data: { amount: factor, currency: to },
      });
    }
  });

  // Messages that arrived before this account could be matched can book now.
  if (sms.value && sms.value !== account.smsMatch) {
    await retryUnmatched({ householdId, userId: ctx.userId });
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
