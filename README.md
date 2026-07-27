# FinanceManager

A self-hosted web app to take **full control of your income, spending, budgets and investments** — multi-user and multi-currency.

Built with **Next.js 15 (App Router) · TypeScript · Prisma · Tailwind CSS · Recharts**.

---

## Features

- 🔐 **Multi-user accounts** — email + password auth, every user's data fully isolated
- 💸 **Income & expense tracking** — categorized transactions, transfers between accounts, recurring flags
- 🏦 **Accounts** — checking, savings, cash, credit cards, each in its own currency, live balances
- 📊 **Budgets** — per-category monthly/weekly/yearly limits with spend-vs-limit progress
- 📈 **Investments** — track stocks, ETFs, crypto & more; cost basis, current value, gain/loss
- 🌍 **Multi-currency** — hold money in many currencies; dashboards convert everything into your base currency
- 📉 **Dashboard** — net worth, cash-flow trend, spending breakdown, budget status at a glance

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your env file and set a secret
cp .env.example .env
#   then edit .env — set AUTH_SECRET to a long random string:
#   openssl rand -base64 32

# 3. Create the database schema (SQLite by default — zero setup)
npm run db:push

# 4. (Optional) seed a demo account + sample data + FX rates
npm run db:seed
#   Demo login →  demo@financemanager.app  /  demo1234

# 5. Run the dev server
npm run dev
```

Open http://localhost:3000 and register a new account (or use the demo login).

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Generate Prisma client + production build |
| `npm run start` | Run the production build |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:migrate` | Create + apply a migration (recommended for prod) |
| `npm run db:seed` | Seed demo data + exchange rates |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |

---

## Project structure

```
prisma/
  schema.prisma        # data model: User, Account, Category, Transaction,
                       # Budget, Investment, ExchangeRate
  seed.ts              # demo data + starter FX rates
src/
  middleware.ts        # route protection (redirects to /login)
  lib/
    prisma.ts          # Prisma client singleton
    jwt.ts             # edge-safe JWT sign/verify (sessions)
    session.ts         # cookie-bound session helpers
    auth.ts            # password hashing + requireUser()
    validation.ts      # zod schemas for every form
    constants.ts       # enum-like values + supported currencies
    currency.ts        # multi-currency conversion
    queries.ts         # dashboard/report aggregations
    defaults.ts        # starter categories for new users
  app/
    actions/           # server actions (auth, transactions, budgets, …)
    login/ register/   # auth pages
    (app)/             # authenticated area (shared sidebar layout)
      dashboard/ transactions/ budgets/ investments/ accounts/ settings/
  components/           # UI: Sidebar, Charts, Modal, forms, …
```

## How auth works

Sessions are a signed **JWT stored in an httpOnly, sameSite=lax cookie** (via
[`jose`](https://github.com/panva/jose)) — no third-party auth service, so you
can read every line of it in `src/lib/jwt.ts` and `src/lib/session.ts`.
Passwords are hashed with `bcryptjs`. `src/middleware.ts` guards the app routes.

## Moving to production (PostgreSQL)

1. In `prisma/schema.prisma` set `datasource.provider = "postgresql"`.
2. Point `DATABASE_URL` at your Postgres instance.
3. Run `npm run db:migrate`.
4. Set a strong `AUTH_SECRET`.
5. Deploy (e.g. Vercel + a hosted Postgres like Neon/Supabase).

## Live market data

FX rates and investment prices can refresh from public APIs (keyless by
default: open.er-api.com for FX, CoinGecko for crypto; stocks optional via a
Finnhub `STOCK_API_KEY`). Two ways to trigger it:

- **In-app** — the **Refresh** button on the Investments page (updates FX +
  your holdings' prices).
- **Scheduled** — point a cron job at `GET /api/cron/refresh`, protected by
  `CRON_SECRET` (refreshes every user):
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/refresh
  ```

Provider hosts and keys are configured in `.env` (see `.env.example`). Refreshes
fail gracefully — a provider outage leaves existing rates/prices untouched.

## Recurring transactions

Set up rules (salary, rent, subscriptions…) on the **Recurring** page and they
auto-post real transactions on schedule — daily/weekly/monthly/yearly, every N
units, with an optional end date. Rules catch up if a run was missed, and stop
automatically once past their end date. Post due ones two ways:

- **In-app** — the **Run due now** button on the Recurring page.
- **Scheduled** — point a cron job at `GET /api/cron/recurring` (protected by
  `CRON_SECRET`, posts for every user):
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/recurring
  ```

## Import / export (CSV)

On the **Transactions** page:

- **Export** downloads all your transactions as CSV.
- **Import** uploads a CSV. Columns (header row required):
  ```
  date, type, amount, currency, account, category, transferAccount, description
  ```
  `date` is `YYYY-MM-DD`; `type` is INCOME / EXPENSE / TRANSFER (default
  EXPENSE). Unknown accounts and categories are created automatically, invalid
  rows are skipped and reported, and a file exported from here re-imports
  cleanly.

## Dark mode

Toggle light/dark from the sidebar footer. Your choice is saved and applied
before first paint (no flash); with no saved choice the app follows your OS
setting.

## Roadmap ideas

- Automated bank sync (e.g. Plaid)
- Shared household budgets & per-member roles

---

Personal finance data is sensitive — keep your `.env` private and use a strong `AUTH_SECRET`.
