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
Done: auth, accounts, transactions, budgets, investments, dashboard,
settings, categories, multi-currency, seed data.

## WHERE TO CONTINUE (next steps, prioritized)
1. **Live data refresh** — pull real FX rates + stock/crypto prices from an API
   on a schedule (rates now manual/seeded). Store into `ExchangeRate` /
   `Investment.currentPrice`.
2. **Edit transactions** — currently add/delete only; add an update action +
   edit form (extend `transactionSchema`, reuse `TransactionForm`).
3. **Recurring auto-posting** — `Transaction.isRecurring/recurrence` are stored
   but nothing materializes future entries yet; needs a cron/scheduled job.
4. **CSV import/export** and bank sync.
5. **Shared household budgets** & per-member roles (multi-user is built; roles
   are not).
6. **Dark mode** — theme scaffolding (`darkMode: "class"`, CSS vars) is in place;
   just needs a toggle + `dark:` styles.

## Branch
Develop on `claude/financial-app-design-x39nuq`.
