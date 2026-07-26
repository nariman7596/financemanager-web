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
dashboard, settings, categories, multi-currency, seed data, **live data refresh**.

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
1. **Recurring auto-posting** — `Transaction.isRecurring/recurrence` are stored
   but nothing materializes future entries yet; needs a cron/scheduled job
   (can reuse the `/api/cron` pattern from the refresh route).
2. **CSV import/export** and bank sync.
3. **Shared household budgets** & per-member roles (multi-user is built; roles
   are not).
4. **Dark mode** — theme scaffolding (`darkMode: "class"`, CSS vars) is in place;
   just needs a toggle + `dark:` styles.
5. **Stock symbol→id coverage** — `CRYPTO_IDS` map in marketdata.ts is a small
   starter; extend, or swap to a lookup API.

## Recently done
- **Live data refresh** (this commit): FX + investment price refresh via
  keyless APIs, in-app button + `/api/cron/refresh` scheduled endpoint,
  configurable providers, graceful failure. See "Live market data" above.
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
