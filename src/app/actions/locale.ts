"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persist the chosen UI language. Always writes the cookie (so it works before
 * login and drives rendering); for a signed-in user it also saves the choice to
 * their profile so it follows them across devices.
 */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  const session = await getSession();
  if (session) {
    await prisma.user
      .update({ where: { id: session.userId }, data: { locale } })
      .catch(() => {
        // Non-fatal: cookie already carries the preference.
      });
  }

  revalidatePath("/", "layout");
}
