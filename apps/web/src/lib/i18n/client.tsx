"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { createT, type TFunc } from "./translate";

type I18nValue = { locale: Locale; t: TFunc };

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  t: createT(DEFAULT_LOCALE),
});

/**
 * Provides the active locale + translator to all Client Components. Rendered
 * once near the root with the locale resolved server-side from the cookie, so
 * client and server render the same language (no hydration mismatch).
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: createT(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT(): TFunc {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
