# Deploying FinanceManager to production

This guide takes the app from local dev (SQLite, no external services) to a real
deployment: **PostgreSQL**, a host (Vercel), **scheduled jobs**, and the
**live market-data** + optional **bank-sync** integrations.

Work top to bottom — each step is self-contained and notes exactly what in this
codebase it touches.

---

## 0. What actually changes dev → prod

| Concern | Dev (now) | Production |
| --- | --- | --- |
| Database | SQLite file (`prisma/dev.db`) | PostgreSQL (Neon / Supabase / RDS) |
| Schema apply | `prisma db push` | `prisma migrate deploy` (versioned) |
| Secrets | `.env` with a dev `AUTH_SECRET` | strong `AUTH_SECRET` + `CRON_SECRET` in host env |
| FX / prices | keyless APIs (blocked in this sandbox) | reachable in prod; optional `STOCK_API_KEY` |
| Recurring / refresh | manual buttons | scheduled cron hitting `/api/cron/*` |
| Bank sync | not built | Plaid (see §7) |

The code is already Postgres-ready: money is `Decimal`, "enum-like" fields are
validated strings, and no SQLite-specific features are used.

---

## 1. Provision PostgreSQL

Any Postgres works. [Neon](https://neon.tech) (serverless, generous free tier)
pairs well with Vercel:

1. Create a project → copy the connection string. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxx.REGION.aws.neon.tech/DB?sslmode=require
   ```
2. For serverless/edge platforms, also grab the **pooled** connection string
   (Neon gives you a `-pooler` host). Use the pooled URL for the app at runtime
   and the **direct** URL for migrations.

Prisma supports both via `directUrl`:

```prisma
// prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // pooled (runtime)
  directUrl = env("DIRECT_URL")         // direct (migrations)
}
```

> Change `provider = "sqlite"` → `"postgresql"`. That's the only schema edit
> required — every model is already compatible.

---

## 2. Create the first migration

Dev has been using `db push` (no migration history), so create an initial
migration once, against a Postgres database:

```bash
# point DATABASE_URL/DIRECT_URL at Postgres in .env first, then:
npx prisma migrate dev --name init      # creates prisma/migrations/…/init
git add prisma/migrations && git commit -m "Add initial Postgres migration"
```

In production you then run (CI/host does this — see §4):

```bash
npx prisma migrate deploy
```

Seed data is **optional** in prod (it creates the demo household). Skip
`db:seed` and just register your real account, or seed once if you want the
exchange rates pre-populated:

```bash
# rates only — the demo user block is skipped if a demo user already exists;
# for a clean prod DB, consider trimming seed.ts to the RATES upsert only.
npm run db:seed
```

---

## 3. Environment variables

Set these in the host's env (not committed). `.env.example` documents them all.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres (pooled) connection string |
| `DIRECT_URL` | ✅ if pooling | Direct Postgres URL for migrations |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` — signs session JWTs |
| `CRON_SECRET` | ✅ (for jobs) | `openssl rand -base64 32` — guards `/api/cron/*` |
| `STOCK_API_KEY` | optional | [Finnhub](https://finnhub.io) key to auto-refresh stock/ETF prices |
| `FX_API_URL` | optional | override the FX provider |
| `COINGECKO_API_URL` | optional | override the crypto provider |

Generate the secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
```

---

## 4. Deploy (Vercel)

1. Push the repo to GitHub and **Import Project** in Vercel.
2. Add all env vars from §3 (Project → Settings → Environment Variables).
3. The committed **`vercel.json`** already sets the build command to
   `prisma generate && prisma migrate deploy && next build` (so migrations apply
   on every deploy) and registers the cron jobs — nothing to configure.
4. Deploy. Visit the URL and register your account — you'll get your own
   household (OWNER) automatically.

Other hosts (Fly.io, Railway, a container) work the same: set env, then run
`npm run build:prod` (= generate + `migrate deploy` + build) on release and
`npm start`.

---

## 5. Scheduled jobs (recurring + market refresh)

Two endpoints do the background work, both guarded by `CRON_SECRET`:

- `GET /api/cron/recurring` — posts due recurring transactions for all households
- `GET /api/cron/refresh` — refreshes FX rates + investment prices for all households

**Vercel Cron** is the easiest — it automatically sends
`Authorization: Bearer $CRON_SECRET`, which is exactly what these routes check.
The committed **`vercel.json`** already declares both jobs (daily recurring post
at 06:00 UTC, hourly price refresh) — just make sure `CRON_SECRET` is set in the
Vercel env. Adjust the schedules there if you like:

```json
{
  "crons": [
    { "path": "/api/cron/recurring", "schedule": "0 6 * * *" },
    { "path": "/api/cron/refresh",   "schedule": "0 * * * *" }
  ]
}
```

**Alternatives** — any scheduler that can send the bearer token:

```bash
# system cron / GitHub Actions
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/recurring
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/refresh
# or with the query param (for schedulers that can't set headers):
curl -fsS "https://your-app/api/cron/refresh?secret=$CRON_SECRET"
```

If `CRON_SECRET` is unset, both endpoints return `503` and do nothing (safe).

---

## 6. Live market data

The refresh uses **keyless** providers by default — no setup beyond outbound
network access:

- **FX:** `open.er-api.com` (USD-based rates)
- **Crypto:** `api.coingecko.com`
- **Stocks/ETFs:** only refresh if you set `STOCK_API_KEY` (Finnhub); otherwise
  they stay at whatever you enter manually.

Make sure your host allows outbound HTTPS to those domains (most do by default;
this dev sandbox specifically blocks them, which is why refresh can't run here).
Refreshes fail gracefully — a provider outage leaves existing data untouched.

To extend crypto coverage, add symbols to `CRYPTO_IDS` in
`src/lib/marketdata.ts` (symbol → CoinGecko id).

---

## 7. Migrating existing data (only if you have some)

A brand-new prod deploy needs nothing here. Two cases matter only if you're
carrying data over:

**(a) Dev SQLite → Postgres.** SQLite data is meant to be disposable. If you
must move it, export each table and import into Postgres (e.g. with a one-off
script using two Prisma clients), or recreate the data through the app.

**(b) Pre-household backfill.** If you have a database from *before* the
ownership move (data keyed by `userId` with no `householdId`), back-fill it once
before the non-null `householdId` columns apply: for each user, create a
Household + an OWNER `Membership`, then set `householdId` (and optional
`createdById`) on all their `Account` / `Category` / `Transaction` / `Budget` /
`Investment` / `RecurringTransaction` rows. New installs are already on the
household model, so this does not apply to a fresh deploy.

---

## 8. Bank sync (Plaid) — not built yet

This is the one remaining external integration. When you're ready, the shape is:

1. **Plaid app** → get `PLAID_CLIENT_ID`, `PLAID_SECRET`, choose an environment
   (`sandbox` → `production`). Add them to env.
2. **Link flow:** an endpoint to create a Plaid `link_token`, the Plaid Link UI
   on the client, and an endpoint to exchange the `public_token` for an
   `access_token` (store it encrypted, scoped to the household).
3. **New models:** `PlaidItem` (access token, institution) and a mapping from
   Plaid accounts → your `Account` rows, both `householdId`-scoped.
4. **Sync:** a `/api/cron/plaid-sync` (guard with `CRON_SECRET`, same pattern as
   the existing cron routes) that pulls transactions via Plaid's
   `/transactions/sync` and inserts them as `Transaction`s — reuse the importer's
   dedupe/auto-create logic in `src/lib/importer.ts`.

It slots cleanly into the existing household + cron architecture; it just needs
real Plaid credentials and outbound access, so it's best built in your own
environment rather than this sandbox.

---

## 9. Go-live checklist

- [ ] `provider = "postgresql"` + `directUrl` set in `schema.prisma`
- [ ] Initial migration committed; `prisma migrate deploy` runs on release
- [ ] Strong `AUTH_SECRET` and `CRON_SECRET` set in host env (not in git)
- [ ] Cron jobs scheduled and returning `{ok:true}` (check once manually)
- [ ] Outbound HTTPS allowed to the FX/crypto/stock hosts
- [ ] `.env` is git-ignored (it is) — no secrets committed
- [ ] Registered a real account; demo seed data not present in prod
- [ ] HTTPS enforced (Vercel does this automatically)
