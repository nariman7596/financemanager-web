// i18n configuration shared by client + server (no next/headers here so it is
// safe to import from either environment).

export const LOCALES = ["en", "fa"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie that carries the chosen UI language (source of truth for rendering). */
export const LOCALE_COOKIE = "fm_locale";

/** Locales that read right-to-left. */
export const RTL_LOCALES: readonly Locale[] = ["fa"];

/** Human labels for the language switcher (each shown in its own script). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fa: "فارسی",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}
