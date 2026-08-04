"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n/server";

/** Update the signed-in user's personal profile (their display name). */
export async function updateProfile(formData: FormData) {
  const session = await getSession();
  const t = await getT();
  if (!session) return { error: t("err.notSignedIn") };
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: t("err.enterName") };

  await prisma.user.update({ where: { id: session.userId }, data: { name } });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}
