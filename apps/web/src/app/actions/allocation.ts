"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkHousehold } from "@/lib/household";
import { ASSET_CLASSES, parseTargets } from "@financemanager/core/allocation";

/** Save target percentages per asset class (summing to 100), or clear them when all are empty. */
export async function saveAllocationTargets(formData: FormData) {
  const { ctx, error } = await checkHousehold("MEMBER");
  if (!ctx) return { error };
  const raw = Object.fromEntries(ASSET_CLASSES.map((c) => [c, String(formData.get(c) ?? "")]));
  const empty = Object.values(raw).every((v) => v.trim() === "" || Number(v) === 0);
  const targets = empty ? null : parseTargets(raw);
  if (!empty && !targets) return { error: "sum" };
  await prisma.household.update({
    where: { id: ctx.householdId },
    data: { allocationTargets: targets ?? Prisma.DbNull },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}
