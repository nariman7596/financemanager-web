// Pure translation core: turn a locale into a `t(key, vars?)` lookup with
// English fallback and `{var}` interpolation. No framework/runtime deps, so it
// works identically in Server Components, Client Components and tests.

import type { Locale } from "./config";
import { en } from "./dictionaries/en";
import { fa } from "./dictionaries/fa";

export const dictionaries: Record<Locale, Record<string, string>> = { en, fa };

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

export function createT(locale: Locale): TFunc {
  const dict = dictionaries[locale] ?? en;
  return (key, vars) => {
    let str = dict[key] ?? en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.split(`{${k}}`).join(String(v));
      }
    }
    return str;
  };
}
