import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@financemanager/i18n/config";
import { createT, type TFunc } from "@financemanager/i18n/translate";

/** Resolve the active locale from the cookie (Server Components / Actions). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Server-side translator bound to the current request's locale. */
export async function getT(): Promise<TFunc> {
  return createT(await getLocale());
}
