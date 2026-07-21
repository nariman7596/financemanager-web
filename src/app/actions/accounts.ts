"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { accountSchema } from "@/lib/validation";

export async function createAccount(formData: FormData) {
  const user = await requireUser();
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    openingBalance: formData.get("openingBalance") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await prisma.account.create({ data: { ...parsed.data, userId: user.userId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  // Ownership check before deleting.
  await prisma.account.deleteMany({ where: { id, userId: user.userId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function archiveAccount(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.account.updateMany({
    where: { id, userId: user.userId },
    data: { isArchived: true },
  });
  revalidatePath("/accounts");
  return { ok: true };
}
