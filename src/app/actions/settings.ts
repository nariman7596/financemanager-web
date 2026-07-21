"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";

export async function updateSettings(formData: FormData) {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: formData.get("baseCurrency"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await prisma.user.update({
    where: { id: user.userId },
    data: parsed.data,
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
