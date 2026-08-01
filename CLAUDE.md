# FinanceManager — project memory

Multi-user, multi-currency personal finance web app. Track income, expenses,
budgets, and investments with full control over money flows.

## Stack
- Next.js 15 (App Router) + TypeScript
- Prisma ORM — SQLite for dev (`prisma/dev.db`), Postgres-ready for prod
- Tailwind CSS · Recharts · lucide-react · zod
- Auth: custom signed httpOnly JWT sessions (`jose` + `bcryptjs`), no third-party
  auth service. Route protection in `src/middleware.ts`.

## Run it
```bash
npm install
cp .env.example .env      # set AUTH_SECRET: openssl rand -base64 32
npm run db:push           # create schema
npm run db:seed           # optional demo data
npm run dev               # http://localhost:3000
```
Demo logins (same household, different roles):
- **demo@financemanager.app / demo1234** — OWNER
- **partner@financemanager.app / demo1234** — MEMBER

## Conventions
- SQLite has no enums → "enum-like" fields are `String`, with allowed values in
  `src/lib/constants.ts` and enforced by zod in `src/lib/validation.ts`.
- **Ownership = Household, not User.** Every owned model has `householdId`
  (scoping) + `createdById` (informational). Server Actions call
  `checkHousehold(minRole)` and pages call `requireHousehold()` — both from
  `src/lib/household.ts` — then scope ALL queries by the returned `householdId`.
  Never query owned data by a householdId that didn't come from that layer.
  Role ranks (src/lib/roles.ts): VIEWER < MEMBER < ADMIN < OWNER. Writes need
  MEMBER; member management needs ADMIN.
- Money handled as Prisma `Decimal`; convert to number with `toNumber()`.
- Multi-currency conversion via `src/lib/currency.ts` using the `ExchangeRate`
  table; dashboards convert everything into the user's `baseCurrency`.
- **Reports / date ranges:** range-based query cores in `queries.ts`
  (`getFlowInRange`, `getSeriesInRange`, `getCategoryBreakdown`,
  `getMemberBreakdown`); the month-based dashboard helpers (`getMonthlyFlow`,
  `getSpendingByCategory`, `getSpendingByMember`) are thin wrappers over them.
  `src/lib/dateRange.ts` (pure) resolves `?preset=/from=/to=` params into a
  concrete range. `/reports` page + `DateRangePicker`. Transaction export takes
  optional `?from&to`.
- Modals: `Modal` exposes a `useCloseModal()` context hook. Do NOT pass function
  children from Server Components to the client `Modal` (breaks the RSC boundary).
- Forms passing a Server Action to a `<form action>` where the action returns a
  value must wrap it in a void closure (see `DeleteButton`, `PriceForm`).
- `cookies()` is async in Next 15 — always `await` it.

## Data model (prisma/schema.prisma)
User · Household · Membership (role) · Invitation · Account · Category ·
Transaction (INCOME/EXPENSE/TRANSFER) · Budget · Investment · ExchangeRate.
Owned models belong to a Household (`householdId`). New users get their own
household (OWNER) with default categories + a Cash account via
`createHousehold` in `src/lib/defaults.ts`.

## Households & roles (`src/lib/household.ts`)
- `getActiveContext()` resolves the caller's active household from the
  `fm_household` cookie **verified against a real Membership** (falls back to
  their first membership if the cookie is missing/forged — a forged cookie to a
  household you don't belong to grants nothing).
- `requireHousehold(minRole)` (pages, redirects/throws) and
  `checkHousehold(minRole)` (actions, returns `{ctx}|{error}`) are the gates.
- Household mgmt actions in `src/app/actions/household.ts`: invite (existing
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
**shared households + per-member roles**.

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
- **Charts** (Recharts) can't use CSS vars for SVG colors, so `src/lib/useIsDark.ts`
  (MutationObserver on `<html>.dark`) + `chartTheme(dark)` drive grid/axis/
  tooltip/legend colors; charts re-theme live on toggle.

## CSV import/export
- Export: `GET /api/export/transactions` (session-authed) streams all the user's
  transactions as CSV. Columns: date,type,amount,currency,account,category,
  transferAccount,description.
- Import: `src/lib/importer.ts` `importTransactionsForUser(userId, csvText)` is
  the pure, testable core (parse → resolve/auto-create accounts+categories →
  createMany); the `importTransactions` Server Action wraps it with requireUser
  + file read + revalidation. Unknown accounts/categories are auto-created;
  invalid rows are skipped with per-row errors. Round-trips with the exporter.
- `src/lib/csv.ts` = dependency-free RFC-4180-ish parse/serialize.
- UI: Export link + Import modal (`ImportForm`) on the Transactions page.

## Recurring auto-posting (`src/lib/recurring.ts`)
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

## Live market data (`src/lib/marketdata.ts`)
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

## WHERE TO CONTINUE (next steps, prioritized)
1. **Bank sync** — the manual CSV import is done; automated bank/Plaid sync is not.
2. **PDF/Excel report export** — Reports page exports filtered CSV; richer
   formats (PDF/xlsx) are not done.
3. **Stock symbol→id coverage** — `CRYPTO_IDS` map in marketdata.ts is a small
   starter; extend, or swap to a lookup API.
4. **Demo seed dates** — seeded relative to seed time, so demo data drifts to
   "last month" as time passes; consider seeding into the current month.

## Recently done
- **Reports + date ranges** (this commit): `/reports` page with preset + custom
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
  `src/lib/ownership.ts`, wrapped by OWNER-gated actions. Delete is blocked on
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

## Branch
Develop on `claude/financial-app-design-x39nuq` (this is the repo's default branch).

## On return — open loop
- **Verify Dependabot alert #1 closed.** The postcss fix (override → 8.5.21,
  `npm audit` = 0 vulnerabilities) is already committed + pushed to the default
  branch. Dependabot auto-closes on its next scan (minutes–hours). Check:
  https://github.com/nariman7596/financemanager/security/dependabot/1 — expect
  "Closed · fixed". Nothing to do unless it's still open.
- Everything else through the postcss fix is committed and pushed; working tree
  clean. Pick up from the "WHERE TO CONTINUE" list above.
