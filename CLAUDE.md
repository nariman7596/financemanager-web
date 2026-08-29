# FinanceManager — project memory

Multi-user, multi-currency personal finance web app. Track income, expenses,
budgets, and investments with full control over money flows.

## Repo layout — pnpm + Turborepo workspace
The app used to be a single package at the repo root; it now lives in
`apps/web/`. See `ARCHITECTURE.md` for the target layout and `ROADMAP.md` for
the phase plan.

```
apps/web            Next.js app (routes, server actions, React components)
packages/core       THE DOMAIN — pure TS, no framework. 70 tests.
packages/i18n       locale config + en/fa dictionaries + createT. 9 tests.
packages/config     shared tsconfig / tailwind preset / eslint
```

**`packages/core` must stay platform-agnostic** — it has to run on the server,
in the browser, in Hermes and in tests. No `next/*`, no `react-native`, no Node
built-ins, no Prisma. `packages/config/eslint/package.js` enforces this and the
rule is verified to fire; `pnpm lint` fails the build if you reach for one.
Subpaths: `@financemanager/core/{access,calendar,constants,csv,currency,
date-range,money,reports,validation}`.

Both packages ship **TypeScript source, not a build artifact** — `apps/web`
compiles them via `transpilePackages` in `next.config.mjs`. Adding a new
shared package means adding it to that list too, or Next will fail to parse it.

The database-backed halves stayed in the app on purpose: `apps/web/src/lib/
currency.ts` loads the ExchangeRate table and calls core's pure `convert`;
`queries.ts`, `recurring.ts`, `importer.ts` still hold their Prisma access.

Deployment entry points (`docker-compose*.yml`, `Dockerfile`,
`docker-entrypoint.sh`, `deploy/`) stay at the **repo root** on purpose: the
VPS runs `docker compose -f docker-compose.ghcr.yml pull` from a clone, so
moving them would break the deploy command on the next `git pull`.

Package manager is **pnpm**, pinned by `packageManager` in the root
package.json (`corepack enable` gives you the right version). npm's hoisting
duplicates `react`/`react-native`, which React Native does not survive.

Nothing calls pnpm at runtime: the Docker entrypoint and the systemd unit both
invoke `node_modules/.bin/next` directly, because `corepack enable` only
installs shims and would fetch the real binary from the registry on first use —
turning every container start into a network dependency.

## Stack
- Next.js 15 (App Router) + TypeScript
- Prisma ORM — **PostgreSQL everywhere** (dev + prod), run via Docker
- Tailwind CSS · Recharts · lucide-react · zod
- Auth: custom signed httpOnly JWT sessions (`jose` + `bcryptjs`), no third-party
  auth service. Route protection in `apps/web/src/middleware.ts`.

## Run it (local dev)
```bash
docker compose -f docker-compose.dev.yml up -d   # local Postgres on :5432
pnpm install
cp .env.example .env      # DATABASE_URL already points at the dev DB
pnpm db:push           # create schema  (set AUTH_SECRET too: openssl rand -base64 32)
pnpm db:seed           # optional demo data
pnpm dev               # http://localhost:3000
```
Full container/VPS guide: `docs/DOCKER.md`.
Demo logins (same household, different roles):
- **demo@financemanager.app / demo1234** — OWNER
- **partner@financemanager.app / demo1234** — MEMBER

## Deployment — live and self-hosted (READ THIS FIRST)

Running privately on the owner's own VPS. Nothing about it is exposed to the
internet, and there are two constraints worth knowing before changing anything.

**The server cannot build this app.** 1 vCPU / 961 MB RAM. A Next.js production
build needs several GB — it thrashed for an hour and the OOM killer took down
sshd. So `.github/workflows/build-image.yml` builds on GitHub's runners and
publishes to `ghcr.io/nariman7596/financemanager-web:latest`, and the server
only pulls. Deploy is `docker compose -f docker-compose.ghcr.yml pull && … up -d`,
about 30 seconds. **Never suggest building on that server.** (2 GB swap was
added as a runtime safety net; running the app costs ~250 MB.)

**443 is taken by an Xray/Reality VPN, and the app is deliberately private.**
`docker-compose.private.yml` / `docker-compose.ghcr.yml` bind the app to
`127.0.0.1:3000` only — no domain, no DNS record, no certificate in the public
Certificate Transparency logs, no open port. Access is over an SSH tunnel.
Note that Docker publishes ports *past* ufw (it writes its own iptables chain),
so the `127.0.0.1:` prefix is the only thing that actually keeps it closed.

Session cookies are `Secure`, which browsers withhold over plain `http://` —
this silently bounced logins back to the login page. `http://localhost` counts
as a secure context so SSH tunnels work; reaching the app at a VPN/LAN address
needs `COOKIE_SECURE=false`, which is only acceptable because nothing is
internet-facing. See `docs/DEPLOY-PRIVATE.md`.

Backups: `deploy/backup.sh` nightly via cron, `deploy/restore.sh` to restore
(restore has been tested end to end). Do **not** replace it with the usual
`pg_dump | gzip && find -delete` one-liner — a failed dump still writes a valid
empty archive, so the prune step deletes the good backups. See `docs/BACKUP.md`.

## Persian localisation — the parts that are not UI strings

The dictionaries were already complete, so what still read as English came from
three places that bypass `t()` entirely. Each is fixed differently, and the
reasoning matters if you touch them:

- **Dates** — `formatDate(date, locale)` renders through the Persian calendar
  for `fa` (native `Intl`, no library). Display only: storage, queries,
  scheduling and CSV export stay Gregorian. Formatted in **UTC** deliberately —
  these values come from date inputs at midnight UTC, and a +03:30 zone would
  shift late-day dates onto the next day.

- **Month periods** — `apps/web/src/lib/calendar.ts` switches between `date-fns` and
  `date-fns-jalali` (pinned to the matching release) so "this month" means the
  month the user actually lives in. This is a real bucketing change, not a
  relabel: Mordad 1405 runs 23 July – 22 August, so labelling a Gregorian
  August total مرداد would have misreported it. Boundaries, bucket keys and
  labels must all come from the same calendar or rows land in the wrong bucket.

- **Category and account names** — these are **rows the household owns**, not UI
  strings. They are seeded in the user's language, and switching language
  re-labels rows that still carry a seeded name (`relabelDefaults`). Anything
  the user renamed or created is left alone, and ids are preserved so
  transactions keep their category. Translating these at render would have left
  the charts and CSV export in English.

- **Date inputs** — `<input type="date">` is the browser's own control and is
  always Gregorian. `apps/web/src/components/DateField.tsx` renders Jalali day/month/year
  selects for `fa` and submits a Gregorian `yyyy-MM-dd` through a hidden input,
  so server actions and validation are unchanged. It has both an uncontrolled
  (form) and a controlled (Reports range picker) mode. Month lengths are handled
  properly, including Esfand being 29 or 30 days by leap year.

Currency: **toman (IRT)** was added. It has no ISO code, so `Intl` renders it as
the literal "IRT" — `formatMoney` formats it directly instead — and no FX feed
quotes it, so its rate is derived from IRR (exactly 10 rial to the toman) rather
than being left silently absent.

## Deploy
Postgres everywhere via Docker. Three guides:
- **`docs/DOCKER.md`** — primary, ELI5: Docker on a VPS with per-project
  isolation (app box + its own Postgres box) behind a shared Caddy reverse
  proxy (auto-HTTPS). Repo ships `Dockerfile`, `docker-entrypoint.sh` (applies
  schema via `migrate deploy` if migrations exist else `db push`, then
  `next start`), `docker-compose.yml` (app + private Postgres, joins external
  `web` network as alias `financemanager`), `docker-compose.dev.yml` (local DB),
  `deploy/proxy/` (Caddy), `.env.docker.example`, `.dockerignore`.
- **`docs/VPS.md`** — bare-metal (systemd + Caddy, no Docker) alternative.
- **`docs/DEPLOYMENT.md`** — managed hosting (Vercel + Neon), `vercel.json` +
  `build:prod` still present for that path.
Cron: hit the `CRON_SECRET`-guarded `/api/cron/recurring` + `/refresh` +
`/bank-sync`.

## Conventions
- "enum-like" fields are `String` (kept portable rather than DB enums), with
  allowed values in `apps/web/src/lib/constants.ts` and enforced by zod in
  `apps/web/src/lib/validation.ts`.
- **Ownership = Household, not User.** Every owned model has `householdId`
  (scoping) + `createdById` (informational). Server Actions call
  `checkHousehold(minRole)` and pages call `requireHousehold()` — both from
  `apps/web/src/lib/household.ts` — then scope ALL queries by the returned `householdId`.
  Never query owned data by a householdId that didn't come from that layer.
  Role ranks (apps/web/src/lib/roles.ts): VIEWER < MEMBER < ADMIN < OWNER. Writes need
  MEMBER; member management needs ADMIN.
- Money handled as Prisma `Decimal`; convert to number with `toNumber()`.
- Multi-currency conversion via `apps/web/src/lib/currency.ts` using the `ExchangeRate`
  table; dashboards convert everything into the user's `baseCurrency`.
- **Reports / date ranges:** range-based query cores in `queries.ts`
  (`getFlowInRange`, `getSeriesInRange`, `getCategoryBreakdown`,
  `getMemberBreakdown`); the month-based dashboard helpers (`getMonthlyFlow`,
  `getSpendingByCategory`, `getSpendingByMember`) are thin wrappers over them.
  `apps/web/src/lib/dateRange.ts` (pure) resolves `?preset=/from=/to=` params into a
  concrete range. `/reports` page + `DateRangePicker`. Transaction export takes
  optional `?from&to`. **Report export:** `apps/web/src/lib/reportCsv.ts` (pure) builds a
  multi-section summary CSV (totals + category + per-member breakdowns); served
  by `/api/export/report?preset=|from&to`. Reports page has Summary + Transactions
  export buttons.
- Modals: `Modal` exposes a `useCloseModal()` context hook. Do NOT pass function
  children from Server Components to the client `Modal` (breaks the RSC boundary).
- Forms passing a Server Action to a `<form action>` where the action returns a
  value must wrap it in a void closure (see `DeleteButton`, `PriceForm`).
- `cookies()` is async in Next 15 — always `await` it.

## Data model (apps/web/prisma/schema.prisma)
User · Household · Membership (role) · Invitation · Account · Category ·
Transaction (INCOME/EXPENSE/TRANSFER) · Budget · Investment · ExchangeRate ·
PlaidItem. Owned models belong to a Household (`householdId`). New users get
their own household (OWNER) with default categories + a Cash account via
`createHousehold` in `apps/web/src/lib/defaults.ts`.

## Households & roles (`apps/web/src/lib/household.ts`)
- `getActiveContext()` resolves the caller's active household from the
  `fm_household` cookie **verified against a real Membership** (falls back to
  their first membership if the cookie is missing/forged — a forged cookie to a
  household you don't belong to grants nothing).
- `requireHousehold(minRole)` (pages, redirects/throws) and
  `checkHousehold(minRole)` (actions, returns `{ctx}|{error}`) are the gates.
- Household mgmt actions in `apps/web/src/app/actions/household.ts`: invite (existing
  user → instant membership; new email → pending Invitation accepted on
  signup), change role, remove, cancel invite, switch active household, create,
  leave, accept/decline, **transfer ownership**, **delete household**. Guards:
  only ADMIN+ manages members; OWNER role isn't set via changeRole (use transfer
  ownership, OWNER-only, which demotes the acting owner to ADMIN); owners can't
  be removed; last owner / last member can't leave; you can't delete your only
  household.
- UI: `HouseholdSwitcher` in the sidebar; `/household` page for members, roles,
  invites; pending-invite badge on the Household nav item.
- **Prod note:** ownership moved User→Household. Dev DB was reset + reseeded.
  A prod DB with existing data needs a backfill (create a household +
  OWNER membership per user, set householdId on their rows) before the
  non-null columns apply.

## Status — foundation complete & verified
Production build passes; all routes smoke-tested (200) with demo data.
Done: auth, accounts, transactions (add/**edit**/delete), budgets, investments,
dashboard, settings, categories, multi-currency, seed data, **live data
refresh**, **recurring auto-posting**, **CSV import/export**, **dark mode**,
**shared households + per-member roles**, **bank sync (Plaid, sandbox)**.

## Theming / dark mode
- Tailwind `darkMode: "class"`. Semantic tokens live as CSS vars in
  `globals.css` — `--bg/--card/--border/--text/--muted/--subtle/--subtle-strong/
  --hover` — with a `.dark` block overriding them (+ `color-scheme`).
- Shared component classes (`.card/.input/.btn-*/.label/.badge`) and helpers
  (`.surface-subtle`, `.row-hover`) consume the tokens, so most theming is
  automatic. A few accents use `dark:` variants (e.g. sidebar active link).
- `ThemeToggle` flips `.dark` on `<html>` + persists to `localStorage`. A tiny
  inline script in the root layout applies it pre-paint (no FOUC); `<html>` has
  `suppressHydrationWarning`. Toggle lives in the sidebar footer.
- Prefer theme tokens over hardcoded `bg-white`/`bg-slate-*`/`text-slate-600`
  for new surfaces so they work in both themes. (slate-400/500 muted text is
  left as-is; it reads fine on dark.)
- **Charts** (Recharts) can't use CSS vars for SVG colors, so `apps/web/src/lib/useIsDark.ts`
  (MutationObserver on `<html>.dark`) + `chartTheme(dark)` drive grid/axis/
  tooltip/legend colors; charts re-theme live on toggle.

## Internationalization (i18n) — English + Persian (RTL)
- Cookie-based locale (`fm_locale` = `en` | `fa`), no locale routing segments. Also
  persisted per user via `User.locale` (default `en`). `getActiveContext`/auth are
  unaffected; the cookie is the source of truth for rendering, and login copies the
  user's saved `locale` onto the cookie.
- `apps/web/src/lib/i18n/`: `config.ts` (locales, `LOCALE_COOKIE`, `dirFor`, `isLocale`,
  `LOCALE_NAMES`), `dictionaries/en.ts` + `fa.ts` (flat, namespaced keys — MUST stay
  key-symmetric), `translate.ts` (`createT(locale)` → `t(key, vars?)` with `{var}`
  interpolation + English fallback), `server.ts` (`getLocale`/`getT`, reads the cookie),
  `client.tsx` (`I18nProvider` + `useT()`/`useLocale()` hooks).
- **Server Components:** `const t = await getT()`; pass `t` (type `TFunc`) as a prop to
  non-async helper components in the same file. **Client Components:** `const t = useT()`.
- Root layout sets `<html lang dir>` from the locale and wraps everything in
  `I18nProvider`; Persian flips to `dir="rtl"` (use logical `border-e`/`start`/`end`
  Tailwind utilities for new chrome so both directions work).
- Enum display values are translated via `t("enum.<group>.<VALUE>")` (txnType,
  accountType, period, invType, role) — stored values stay English.
- `LanguageSwitcher` (`inline` pills on login/register, `menu` in sidebar + settings) →
  `setLocale` action (cookie + profile) → `router.refresh()`.
- To translate a new string: add the SAME key to en.ts AND fa.ts, then `t("key")`.

## CSV import/export
- Export: `GET /api/export/transactions` (session-authed) streams all the user's
  transactions as CSV. Columns: date,type,amount,currency,account,category,
  transferAccount,description.
- Import: `apps/web/src/lib/importer.ts` `importTransactionsForUser(userId, csvText)` is
  the pure, testable core (parse → resolve/auto-create accounts+categories →
  createMany); the `importTransactions` Server Action wraps it with requireUser
  + file read + revalidation. Unknown accounts/categories are auto-created;
  invalid rows are skipped with per-row errors. Round-trips with the exporter.
- `apps/web/src/lib/csv.ts` = dependency-free RFC-4180-ish parse/serialize.
- UI: Export link + Import modal (`ImportForm`) on the Transactions page.

## Recurring auto-posting (`apps/web/src/lib/recurring.ts`)
- `RecurringTransaction` model = a rule/template (type, account(s), category,
  amount, currency, frequency, interval, startDate, nextRunDate, endDate?,
  isActive). Generated `Transaction`s link back via `Transaction.recurringId`.
- `postDueRecurring(userId?, asOf)` materializes every due occurrence, catching
  up if behind (capped at 366/rule), advances `nextRunDate`, and deactivates a
  rule once past `endDate`. Idempotent (re-running posts nothing new).
- Triggers: `/recurring` page (add/**edit**/pause/resume/delete + **Run due
  now**) and scheduled `GET/POST /api/cron/recurring` (guarded by `CRON_SECRET`,
  all users). Creating or editing a rule auto-posts anything already due.
- Edit reuses `RecurringForm` (`rule` prop) → `updateRecurring`. nextRunDate
  follows the new startDate only while the rule hasn't posted yet (lastPosted
  null); once posting has begun the cursor is preserved.
- The one-off `TransactionForm` no longer has a recurring checkbox (it did
  nothing); recurrence is now this dedicated feature. `Transaction.isRecurring/
  recurrence` columns remain but are unused/legacy.

## Live market data (`apps/web/src/lib/marketdata.ts`)
- Keyless defaults: FX via open.er-api.com (USD-based), crypto via CoinGecko.
  Stocks optional via `STOCK_API_KEY` (Finnhub). All URLs overridable by env.
- `refreshAll(userId?)` → `refreshFxRates` (stores USD->X for all supported
  currencies; conversions triangulate through USD) + `refreshInvestmentPrices`
  (crypto by symbol→CoinGecko-id map; only USD-priced holdings auto-update).
- Triggers: in-app **Refresh** button (`RefreshButton` → `refreshMarketData`
  action, on Investments page) and scheduled `GET/POST /api/cron/refresh`
  (guarded by `CRON_SECRET`; refreshes all users). Both fail gracefully — a
  provider outage returns an error summary and leaves existing data intact.
- NOTE: this sandbox's network policy BLOCKS those public API hosts (proxy 403),
  so the live fetch can't run here; verified end-to-end against a localhost mock
  (fetch→parse→store→update all correct) + graceful-failure + cron auth gating.

## Bank sync (`apps/web/src/lib/plaid.ts`)
- `PlaidItem` = one linked bank connection (encrypted `accessToken`, cursor,
  status). An `Account` opts in via `source="PLAID"` + `plaidItemId`/
  `plaidAccountId` — sync merges into that **existing** Account rather than
  auto-creating a parallel "linked" one; a household member explicitly maps
  each Plaid-returned account during connect (`PlaidAccountMappingForm`), or
  skips it.
- `syncTransactionsForItem(item)` pages Plaid's `/transactions/sync` from the
  stored cursor and **upserts by `Transaction.plaidTransactionId`** — the
  dedup key the CSV importer still lacks. Cursor only advances after a
  successful page (idempotent re-run, same pattern as `recurring.ts`'s
  `nextRunDate`). Failures are recorded on `PlaidItem.status/error`, never
  thrown, so one broken item doesn't block others.
- `refreshBankSync(householdId?)` fans that out over every `PlaidItem` in
  scope. Triggers: **Sync now** button (`BankSyncButton`) and scheduled
  `GET/POST /api/cron/bank-sync` (guarded by `CRON_SECRET`, all households).
- `apps/web/src/lib/crypto.ts`: AES-256-GCM `encrypt`/`decrypt`, keyed by
  `TOKEN_ENCRYPTION_KEY` — the only encrypted-at-rest field in this schema,
  since a Plaid access token is a live bank credential.
- Whole feature no-ops gracefully (UI hidden, cron returns an empty summary)
  when `PLAID_CLIENT_ID`/`PLAID_SECRET` aren't set — same convention as
  `STOCK_API_KEY` in `marketdata.ts`.
- UI lives on `/accounts` (no separate nav item): "Connect a bank" modal,
  per-account "Link to bank"/"Unlink", and "Sync now". `PlaidLinkButton` is
  this app's first use of `next/script` (loads Plaid's Link JS — no npm
  widget for it).
- **Sandbox only so far** — needs real `PLAID_CLIENT_ID`/`PLAID_SECRET` (free,
  instant at dashboard.plaid.com) + `TOKEN_ENCRYPTION_KEY` in `.env` to
  exercise live; sandbox test login is `user_good`/`pass_good` at any
  institution.

## WHERE TO CONTINUE (next steps, prioritized)
1. **Bank sync production readiness** — sandbox-only so far (see "Bank sync"
   above). Needs real Plaid credentials to test live, then production
   `PLAID_ENV` + webhook-based sync (instead of relying only on cron polling)
   before going beyond sandbox users.
2. **PDF/Excel report export** — Reports exports summary + transactions CSV;
   richer formats (PDF/xlsx) would need a library (better added in prod env).
3. **Stock symbol→id coverage** — `CRYPTO_IDS` map in marketdata.ts is a small
   starter; extend, or swap to a lookup API.
4. **Demo seed dates** — seeded relative to seed time, so demo data drifts to
   "last month" as time passes; consider seeding into the current month.

## Recently done
- **Persian localisation completed + private self-hosted deploy** (this session):
  Jalali dates end to end (display, month bucketing, entry forms, reports range
  filter), toman currency, Persian seeded categories, translated date-range
  presets. Deployed privately behind an SSH tunnel with CI-built images and
  verified backups. Eight real deployment blockers were found and fixed along
  the way — a missing initial Prisma migration (the deploy "succeeded" onto an
  empty database), a missing `directUrl`, two wrong clone paths in the docs, the
  `Secure` cookie bouncing logins, a build the server could not run, a backup
  one-liner that could delete its own backups, and a stale lockfile that broke
  CI. See the sections above for the reasoning behind each choice.
- **Persian translation + language switcher (i18n)** (this commit): cookie + per-user
  `User.locale`; `apps/web/src/lib/i18n/` (config, en/fa dictionaries, `createT`, server `getT`,
  client `I18nProvider`/`useT`); `LanguageSwitcher` on login/register + sidebar + settings;
  root layout drives `lang`/`dir` (Persian = RTL). Every page/form/component wired to `t()`;
  enum labels translated by value. Verified: prod build clean, full `tsc` clean, en/fa
  dictionaries key-symmetric (342 keys each), runtime screenshots confirm `dir=rtl` +
  Persian on `/login` and `/register` with English intact. Needs `db push` to add the
  `locale` column (default `en`, so no backfill).
- **Bank sync (Plaid, sandbox)** (commit `1534122`): `PlaidItem` model +
  `Account.source/plaidItemId/plaidAccountId` +
  `Transaction.plaidTransactionId/pending`; `apps/web/src/lib/plaid.ts` (Link token, exchange,
  cursor-based `/transactions/sync` upserting by `plaidTransactionId`) +
  `apps/web/src/lib/crypto.ts` (AES-256-GCM token encryption); `/api/cron/bank-sync`;
  `banksync.ts` actions (ADMIN-gated linking, MEMBER-gated sync); `/accounts`
  page gained Connect-a-bank / Link-to-bank / Unlink / Sync-now, all hidden
  when unconfigured. Verified: build clean, 7-assertion mapping-logic suite
  (Plaid amount sign → EXPENSE/INCOME, category fallback), cron auth guard
  live (503/401/200). Not yet exercised end-to-end — needs real sandbox
  `PLAID_CLIENT_ID`/`PLAID_SECRET`/`TOKEN_ENCRYPTION_KEY`.
- **Report summary export** (this commit): `reportCsv.ts` pure builder +
  `/api/export/report` route; Reports page offers Summary + Transactions CSV.
  Verified: 8-assertion builder suite + runtime route (auth, headers, real
  demo values, category shares, member breakdown).
- **Reports + date ranges**: `/reports` page with preset + custom
  date ranges (`dateRange.ts`, 9-assertion test), range-based query cores that
  the dashboard helpers now delegate to, income/expense trend + category +
  per-member breakdowns, and range-filtered CSV export. Verified at runtime
  (totals, preset switch, export row counts) + dashboard unaffected.
- **Edit recurring rules**: `updateRecurring` action + edit mode
  in `RecurringForm` (`rule` prop) + per-row Edit button. nextRunDate follows a
  new start date only while unposted. Verified: 5-assertion suite (field update,
  both nextRunDate branches, household scoping) + page renders the control.
- **Chart theming**: `useIsDark` hook + `chartTheme()` thread
  dark/light colors through the Recharts grid/axis/tooltip/legend; verified with
  Chromium screenshots of the dashboard in both themes.
- **Per-member spending views**: `getSpendingByMember` groups the
  month's income/expense by `Transaction.createdById` → member name (base
  currency; includes every member + an "Unknown" bucket). Dashboard shows a
  "Spending by member" card (only when >1 member); Transactions rows show
  "by {member}" in shared households. Verified at runtime (Demo $1,800 / Partner
  $375, correct creator labels).
- **Ownership transfer + delete household**: OWNER can hand off
  ownership (target→OWNER, self→ADMIN) via `transferOwnershipTo`, and delete a
  household (cascade) via `deleteHouseholdFor` — both pure cores in
  `apps/web/src/lib/ownership.ts`, wrapped by OWNER-gated actions. Delete is blocked on
  your only household. UI: "Make owner" per member + "Delete household" danger
  action, OWNER-only. Verified: 13-assertion suite (transfer effects + guards,
  cascade, last-household block) + owner-only control visibility by role.
- **Shared households + per-member roles**: ownership moved
  User→Household; Membership/Invitation models; centralized access layer
  (`household.ts`) with role gates; `/household` mgmt page + sidebar switcher.
  Verified: 13-assertion suite (role policy, invites, isolation, cascade) +
  runtime isolation incl. forged-cookie defense (non-member with a forged
  household cookie sees 0 rows) + MEMBER shared access + all pages 200 both roles.
- **Dark mode**: CSS-var theme tokens + `.dark` overrides,
  `ThemeToggle` (localStorage + pre-paint script, no FOUC), themed shared
  component classes. Verified: build + all routes 200 in both themes, no
  hydration warnings.
- **CSV import/export**: export route + testable importer core
  (auto-creates accounts/categories, skips bad rows) + Transactions-page UI.
  19-assertion test suite passes; export verified live (auth, headers, round-trip).
- **Recurring auto-posting**: `RecurringTransaction` model +
  `postDueRecurring` engine (catch-up, endDate stop, idempotent) + `/recurring`
  page + `/api/cron/recurring`. Verified: backfill (4 posts), endDate
  deactivation (3 posts), future/not-due (0), user-scoped, idempotent.
- **Live data refresh**: FX + investment price refresh via keyless APIs, in-app
  button + `/api/cron/refresh` endpoint, configurable providers, graceful
  failure. See "Live market data" above.
- **Edit transactions** (commit `bac98de`): `updateTransaction` action +
  edit mode in `TransactionForm` + per-row Edit button. Ownership-scoped,
  verified persisting.

## Repo & branch
Lives in its own repo **`nariman7596/financemanager-web`**, default branch
**`main`**. Develop on `main` (or feature branches off it). Local dev happens on
a Mac in VS Code + Docker (see `docs/WORKFLOW.md`).

## On return
- Working tree is clean; everything committed and pushed to `main`.
- **Verify before pushing.** CI builds the image the server runs, so a red build
  means the server silently keeps the old one — that happened twice this
  session. Run `pnpm typecheck` *and* `pnpm build` locally first.
- Open: 3 dependabot advisories (2 high) on the default branch. Recurring-rule
  scheduling still advances by Gregorian month — it runs from a background job
  with no user to take a locale from, so making it calendar-aware needs a
  decision about where that calendar is stored (probably on the rule itself).
  A Jalali `from > to` in the Reports filter falls back to the preset silently,
  since selects cannot express the native input's min/max.
- Bank sync (Plaid) just landed but is sandbox-only and unverified live — get
  free sandbox keys at dashboard.plaid.com, set `PLAID_CLIENT_ID`/
  `PLAID_SECRET`/`PLAID_ENV=sandbox`/`TOKEN_ENCRYPTION_KEY` in `.env`, then
  drive Connect a bank → map → Sync now in a browser (sandbox login
  `user_good`/`pass_good`) before considering it done.
- Otherwise pick up from the "WHERE TO CONTINUE" list above (stock-symbol
  coverage, PDF/Excel export, etc.).
