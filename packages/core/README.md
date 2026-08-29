# @financemanager/core

The domain. Pure TypeScript: no Next.js, no React, no React Native, no Prisma,
no Node built-ins — so the same code runs on the server, in the browser, in
Hermes and in tests. The ESLint config in `@financemanager/config/eslint/package`
enforces that rather than trusting convention.

| Subpath | What it holds |
| --- | --- |
| `./access` | role ranks and comparison |
| `./calendar` | Gregorian ⇄ Jalali month arithmetic and bucketing |
| `./constants` | enum-like values and the supported currencies |
| `./csv` | dependency-free RFC-4180-ish parse/serialize |
| `./currency` | conversion maths over a caller-supplied rate map |
| `./date-range` | resolves `?preset=/from=/to=` into a concrete range |
| `./money` | `formatMoney`, `toNumber`, date display formatting |
| `./reports` | the multi-section summary CSV builder |
| `./validation` | the zod schemas — one source of truth for every transport |

## Two things to know before changing anything here

**Calendar bucketing is not cosmetic.** Mordad 1405 runs 23 July – 22 August.
Boundaries, bucket keys and labels must all come from the *same* calendar, or
rows land in the wrong bucket and the total is simply wrong. `calendar` and
`date-range` are tested together for exactly this.

**Toman is not a normal currency.** It has no ISO 4217 code, so `Intl` renders
it as the literal "IRT" with decimals it does not have; `formatMoney` special-
cases it. Its rate is derived from IRR at exactly 10 rial to the toman rather
than fetched, because no FX feed quotes it. A 10× error here is a serious bug,
not a rounding difference.

## Known limit: Intl on React Native

`money.formatDate` uses `Intl.DateTimeFormat` with the `fa-IR-u-ca-persian`
calendar. Hermes needs to be built with Intl support for that to work; plain
JSC and a bare Hermes will not render the Persian calendar. Phase 8 must verify
this on a real device and, if needed, add a polyfill in the mobile app rather
than changing this module.
