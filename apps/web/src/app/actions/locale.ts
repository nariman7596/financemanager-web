"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale, type Locale } from "@financemanager/i18n/config";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { relabelDefaults } from "@/lib/defaults";

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

    // Category and account names are rows, not UI strings, so switching the
    // language does not translate them. Re-label the ones still carrying a
    // seeded name — anything the user renamed or created is left untouched,
    // and ids are preserved so existing transactions keep their category.
    await relabelDefaultsForUser(session.userId, locale).catch(() => {
      // Non-fatal: the language switch itself has already taken effect.
    });
  }

  revalidatePath("/", "layout");
}

/** Re-label seeded rows in every household this user belongs to. */
async function relabelDefaultsForUser(userId: string, locale: Locale) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { householdId: true },
  });
  for (const m of memberships) {
    await relabelDefaults(m.householdId, locale);
  }
}
