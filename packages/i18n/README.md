# @financemanager/i18n

Locale configuration, the translation core, and the English/Persian
dictionaries. Framework-free, so the same `t()` runs in Server Components,
Client Components, React Native and tests.

Deliberately **not** here:

- `getLocale`/`getT` (apps/web/src/lib/i18n/server.ts) — reads the cookie via
  `next/headers`.
- `I18nProvider`/`useT` (apps/web/src/lib/i18n/client.tsx) — React context.

Both are transport-specific wrappers around `createT` from this package. Mobile
will add its own equivalents rather than sharing these.

## The one rule

`en.ts` and `fa.ts` must stay **key-symmetric**. A key present in only one
dictionary silently falls back to English at runtime, which reads as a bug in
production rather than a missing translation. `dictionaries.test.ts` enforces
this — it is the reason this package has tests at all.
