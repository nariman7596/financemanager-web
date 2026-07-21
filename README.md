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

## Roadmap ideas

- Live FX + stock/crypto price refresh (background job)
- Recurring-transaction auto-posting (cron)
- CSV import/export & bank sync
- Editing transactions (currently add/delete)
- Shared household budgets & per-member roles
- Dark mode (the theme scaffolding is already in place)

---

Personal finance data is sensitive — keep your `.env` private and use a strong `AUTH_SECRET`.
