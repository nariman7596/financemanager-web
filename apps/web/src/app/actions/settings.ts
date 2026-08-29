"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@financemanager/db";
import { getSession } from "@/lib/session";

/** Update the signed-in user's personal profile (their display name). */
export async function updateProfile(formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "You're not signed in" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: "Enter a name" };

  await prisma.user.update({ where: { id: session.userId }, data: { name } });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}
