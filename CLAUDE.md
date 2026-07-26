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
Demo login: **demo@financemanager.app / demo1234**

## Conventions
- SQLite has no enums → "enum-like" fields are `String`, with allowed values in
  `src/lib/constants.ts` and enforced by zod in `src/lib/validation.ts`.
- Mutations are Server Actions in `src/app/actions/*`; every action calls
  `requireUser()` and scopes queries by `userId` (data isolation).
- Money handled as Prisma `Decimal`; convert to number with `toNumber()`.
- Multi-currency conversion via `src/lib/currency.ts` using the `ExchangeRate`
  table; dashboards convert everything into the user's `baseCurrency`.
- Modals: `Modal` exposes a `useCloseModal()` context hook. Do NOT pass function
  children from Server Components to the client `Modal` (breaks the RSC boundary).
- Forms passing a Server Action to a `<form action>` where the action returns a
  value must wrap it in a void closure (see `DeleteButton`, `PriceForm`).
- `cookies()` is async in Next 15 — always `await` it.

## Data model (prisma/schema.prisma)
User · Account · Category · Transaction (INCOME/EXPENSE/TRANSFER) · Budget ·
Investment · ExchangeRate. New users get default categories + a Cash account
via `src/lib/defaults.ts`.

## Status — foundation complete & verified
Production build passes; all routes smoke-tested (200) with demo data.
Done: auth, accounts, transactions (add/**edit**/delete), budgets, investments,
dashboard, settings, categories, multi-currency, seed data, **live data
refresh**, **recurring auto-posting**, **CSV import/export**.

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
- Triggers: `/recurring` page (add/pause/resume/delete + **Run due now**) and
  scheduled `GET/POST /api/cron/recurring` (guarded by `CRON_SECRET`, all users).
  Creating a rule auto-posts anything already due.
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
1. **Shared household budgets** & per-member roles (multi-user is built; roles
   are not).
2. **Dark mode** — theme scaffolding (`darkMode: "class"`, CSS vars) is in place;
   just needs a toggle + `dark:` styles.
3. **Bank sync** — the manual CSV import is done; automated bank/Plaid sync is not.
4. **Stock symbol→id coverage** — `CRYPTO_IDS` map in marketdata.ts is a small
   starter; extend, or swap to a lookup API.
5. **Edit recurring rules** — currently add/pause/delete (no edit form yet).

## Recently done
- **CSV import/export** (this commit): export route + testable importer core
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
