"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { getT } from "@/lib/i18n/server";
import {
  createLinkToken as plaidCreateLinkToken,
  exchangePublicToken as plaidExchangePublicToken,
  refreshBankSync,
  removePlaidItem,
  syncTransactionsForItem,
  type PlaidAccountOption,
  type BankSyncSummary,
} from "@/lib/plaid";

function revalidateMoney() {
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

export async function createLinkToken(): Promise<{ linkToken?: string; error?: string }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  return plaidCreateLinkToken(ctx.userId);
}

export async function exchangePublicTokenAction(
  publicToken: string,
): Promise<{ plaidItemDbId?: string; accounts?: PlaidAccountOption[]; error?: string }> {
  // Storing a bank access token is a household-wide credential, so this
  // requires ADMIN — same bar as inviting/removing members.
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  return plaidExchangePublicToken(ctx.householdId, ctx.userId, publicToken);
}

export type AccountMapping = { plaidAccountId: string; localAccountId: string | null };

export async function mapPlaidAccounts(
  plaidItemDbId: string,
  mappings: AccountMapping[],
): Promise<{ ok?: true; error?: string }> {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };

  const t = await getT();
  const item = await prisma.plaidItem.findFirst({
    where: { id: plaidItemDbId, householdId: ctx.householdId },
  });
  if (!item) return { error: t("err.bankConnNotFound") };

  const wanted = mappings.filter((m) => m.localAccountId);
  if (wanted.length > 0) {
    const owned = await prisma.account.findMany({
      where: {
        id: { in: wanted.map((m) => m.localAccountId!) },
        householdId: ctx.householdId,
        source: "MANUAL",
      },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((a) => a.id));
    for (const m of wanted) {
      if (!ownedIds.has(m.localAccountId!)) {
        return { error: t("err.chooseOwnUnlinked") };
      }
    }
    for (const m of wanted) {
      await prisma.account.update({
        where: { id: m.localAccountId! },
        data: { source: "PLAID", plaidItemId: item.id, plaidAccountId: m.plaidAccountId },
      });
    }
  }

  if (wanted.length === 0) {
    // Nothing mapped from this item — nothing to sync, drop the connection.
    await removePlaidItem(item.id);
    return { ok: true };
  }

  await syncTransactionsForItem(item);
  revalidateMoney();
  return { ok: true };
}

export async function unlinkAccount(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  const id = String(formData.get("id"));

  const account = await prisma.account.findFirst({
    where: { id, householdId: ctx.householdId },
  });
  if (!account) {
    const t = await getT();
    return { error: t("err.accountNotFound") };
  }
  if (account.source !== "PLAID" || !account.plaidItemId) return { ok: true };

  const plaidItemId = account.plaidItemId;
  await prisma.account.update({
    where: { id },
    data: { source: "MANUAL", plaidItemId: null, plaidAccountId: null },
  });

  const remaining = await prisma.account.count({ where: { plaidItemId } });
  if (remaining === 0) await removePlaidItem(plaidItemId);

  revalidatePath("/accounts");
  return { ok: true };
}

export async function syncNow(): Promise<BankSyncSummary & { error?: string }> {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { items: 0, added: 0, modified: 0, removed: 0, errors: [], error };
  const summary = await refreshBankSync(ctx.householdId);
  revalidateMoney();
  return summary;
}
