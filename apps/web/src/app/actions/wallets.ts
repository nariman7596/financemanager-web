"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { syncWallets } from "@/lib/wallets";
import { ADDRESS_KINDS, isValidAddress, type AddressKind } from "@financemanager/core/wallets";

function revalidate() {
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  revalidatePath("/goals");
}

/**
 * The wallet's name and one public address per network (`addr_<kind>`,
 * blank = not used). Returns the networks whose address does not look like
 * one, so the form can mark those fields.
 */
function parseWallet(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const addresses: Partial<Record<AddressKind, string>> = {};
  const invalid: AddressKind[] = [];
  for (const kind of ADDRESS_KINDS) {
    const v = String(formData.get(`addr_${kind}`) ?? "").trim();
    if (!v) continue;
    if (isValidAddress(kind, v)) addresses[kind] = v;
    else invalid.push(kind);
  }
  return { name, addresses, invalid };
}

/** Create or (with `id`) edit a wallet, then read its balances right away. */
export async function saveWallet(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const id = String(formData.get("id") ?? "");
  const { name, addresses, invalid } = parseWallet(formData);
  if (!name) return { error: "Name is required" };
  if (invalid.length) return { invalid };
  if (Object.keys(addresses).length === 0) return { error: "Enter at least one address" };

  let walletId = id;
  if (id) {
    const res = await prisma.wallet.updateMany({ where: { id, householdId: ctx.householdId }, data: { name, addresses } });
    if (res.count === 0) return { error: "Not found" };
    // A network whose address was removed takes its holdings with it.
    const kept = new Set(Object.keys(addresses));
    const stale = await prisma.investment.findMany({ where: { walletId: id }, select: { id: true, walletAsset: true } });
    const gone = stale.filter((h) => {
      const chain = h.walletAsset?.split(":")[0] ?? "";
      const kind = chain === "ethereum" || chain === "arbitrum" ? "evm" : chain;
      return !kept.has(kind);
    });
    if (gone.length) await prisma.investment.deleteMany({ where: { id: { in: gone.map((h) => h.id) } } });
  } else {
    const w = await prisma.wallet.create({
      data: { name, addresses, householdId: ctx.householdId, createdById: ctx.userId },
    });
    walletId = w.id;
  }
  const summary = await syncWallets(ctx.householdId, walletId).catch(() => null);
  revalidate();
  return { ok: true, errors: summary?.errors ?? [] };
}

/** Stop following a wallet; its holdings go with it (the coins stay where they are). */
export async function deleteWallet(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  await prisma.wallet.deleteMany({ where: { id: String(formData.get("id")), householdId: ctx.householdId } });
  revalidate();
  return { ok: true };
}
