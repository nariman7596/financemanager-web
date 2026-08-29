"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { loginSchema, registerSchema } from "@financemanager/core/validation";
import { createHousehold } from "@/lib/defaults";
import { acceptInvitesForUser } from "@/lib/invites";
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from "@financemanager/i18n/config";
import { getT } from "@/lib/i18n/server";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Read the language currently selected on the device (entry-screen choice). */
async function currentLocale() {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Persist a user's language to the cookie so their preference drives rendering. */
async function applyLocaleCookie(locale: string) {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
}

export type ActionState = { error?: string } | undefined;

export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    baseCurrency: formData.get("baseCurrency") || "USD",
  });
  const t = await getT();
  const locale = await currentLocale();
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("auth.err.invalidInput") };
  }
  const { name, email, password, baseCurrency } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: t("auth.err.emailExists") };

  const user = await prisma.user.create({
    data: {
      name,
      email,
      baseCurrency,
      locale,
      passwordHash: await hashPassword(password),
    },
  });

  // Give the new user their own household (OWNER) with starter data.
  await createHousehold(user.id, t("auth.householdName", { name }), baseCurrency, locale);
  // Auto-join any households they were invited to before signing up.
  await acceptInvitesForUser(user.id, email);

  await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
  redirect("/dashboard");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getT();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: t("auth.err.invalidEmailPassword") };

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: t("auth.err.invalidCredentials") };
  }

  // Their saved language wins on this device from now on.
  await applyLocaleCookie(user.locale);
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
