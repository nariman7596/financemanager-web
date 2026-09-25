# FinanceManager — project memory

Multi-user, multi-currency personal finance web app. Track income, expenses,
budgets, and investments with full control over money flows.

## Repo layout — pnpm + Turborepo workspace
The app used to be a single package at the repo root; it now lives in
`apps/web/`. See `ARCHITECTURE.md` for the target layout and `ROADMAP.md` for
the phase plan.

```
apps/web            Next.js app (routes, server actions, React components)
packages/core       THE DOMAIN — pure TS, no framework. 204 tests.
packages/i18n       locale config + en/fa dictionaries + createT. 9 tests.
packages/config     shared tsconfig / tailwind preset / eslint
```

**`packages/core` must stay platform-agnostic** — it has to run on the server,
in the browser, in Hermes and in tests. No `next/*`, no `react-native`, no Node
built-ins, no Prisma. `packages/config/eslint/package.js` enforces this and the
rule is verified to fire; `pnpm lint` fails the build if you reach for one.
Subpaths: `@financemanager/core/{access,budgets,calendar,constants,csv,currency,
date-range,goals,loans,market,money,networth,reconcile,reports,sms,validation,
wallets}`.

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
about 30 seconds. **Never suggest building on that server.** The full update
line is in `docs/DEPLOY-PUBLIC.md` and ends in `docker image prune -f`: every
pull left the previous image behind, and after one busy day 16 GB of them
filled the 24 GB disk (`no space left on device`). The image no longer
carries `.next/cache` (~0.5 GB of webpack cache `next start` never reads). (2 GB swap was
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

**Optional public mode for phone access** (`docker-compose.public.yml`,
`docs/DEPLOY-PUBLIC.md`): Caddy on **8443** (443 stays Xray's) with a real
certificate for `<ip-dashes>.sslip.io`, obtained via port 80 — no domain, no
tunnel, just Safari → Add to Home Screen. Enabled by `COMPOSE_FILE=` in `.env`
so the usual `docker compose` commands include it. Being public, it pairs with
`ALLOW_REGISTRATION=false` (sign-up closed except for invited emails, checked
in `registerAction`). Plain `http://IP:3000` was rejected: passwords and
figures would cross the carrier network in clear text.

**What actually works from Iran (live since 2026-09-23):** neither 8443 nor
443 is reachable directly — non-standard ports to foreign IPs are blocked and
`sslip.io` is filtered by SNI. The app is reached **through the owner's own VPN**:
iPhone → OpenWrt router (Nikki/mihomo, rule `AND,((IP-CIDR,<ip>/32),(DST-PORT,443)),PROXY`
above its `IP-CIDR,<ip>/32,DIRECT`) → VLESS Reality tunnel → sing-box on the server,
whose first route rule overrides `<ip>:443` to `127.0.0.1:8443` (Caddy). Without
that rule the request loops into sing-box's own :443, Reality rejects it as an
invalid client and forwards it to its camouflage site (a Fastly cert error).
**Away from home** the owner's V2Box app on the iPhone (VLESS to the same server)
already reaches the app with no extra rule (confirmed 2026-09-24), since it
tunnels the server's own IP and sing-box applies the same override.
Reality's `handshake` is untouched; an HAProxy SNI router in front of it was
tried, is unnecessary, and was removed. `HTTPS_BIND=127.0.0.1` keeps 8443 off
the internet; port 80 stays open for certificate renewal. Details:
`docs/DEPLOY-PUBLIC.md`. The server's proxy is **sing-box**, not Xray.
**SSH also goes through the VPN:** direct SSH from Iran started being cut at
the key exchange (`kex_exchange_identification: Connection closed`), so the
router has a second rule, `AND,((IP-CIDR,<ip>/32,no-resolve),(DST-PORT,22)),PROXY`,
above the DIRECT one. If the VPN is down, SSH needs that rule removed
(backup at `/root/smartconnect.yaml.bak2` on the router).
**The router rules can vanish:** on 2026-09-25 the profile
`/etc/nikki/profiles/smartconnect.yaml` was rewritten (Nikki left a
`smartconnect.yaml.bak.<epoch>` beside it) and both `AND` rules were gone —
the Mac on home Wi-Fi could not open the app while the iPhone on V2Box could.
Symptom from the router: the socks5 curl in `docs/DEPLOY-PUBLIC.md` fails with
an SSL EOF instead of 200. Fix: re-insert both rules above the DIRECT line
(`grep -n 216.126.229.4 /etc/nikki/run/config.yaml` shows what is live) and
`/etc/init.d/nikki restart`.

Backups: `deploy/backup.sh` nightly via cron, `deploy/restore.sh` to restore
(restore has been tested end to end). An **off-server copy** is pulled daily
by the owner's Mac (`deploy/mac/fm-backup-setup.sh`, launchd, keeps everything,
notifies only when the server is unreachable for 3 days or its newest backup is
stale/corrupt) with a key whose forced command is a tar of the finished
backups (`deploy/allow-backup-pull.sh`; `rrsync -ro` was rejected by macOS's
openrsync) — it is passphrase-less, so it must not be able
to do anything but read backups. Do **not** replace it with the usual
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

## Bank SMS import (`docs/SMS.md`)
iOS lets no app read SMS, so an **iOS Shortcuts "When I receive a message"
automation** posts each bank SMS to `POST /api/ingest/sms` (`Authorization:
Bearer fm_…`, a per-device `ApiToken`, SHA-256 stored only). The shortcut
(`deploy/ios/fin.shortcut`, signed on the Mac and AirDropped; it asks for the key on
import) posts the message itself first and queues it in `fm-sms.txt` only if that
fails: iOS keeps iCloud Drive files out of reach while the phone is locked, and
the old append-first order silently lost every SMS that arrived while it was
(two bills, a loan instalment and a deposit one morning). After a successful
send it flushes the queue, posting the whole file and deleting it only on
positive success (the response has `received`; an empty 502 from Caddy during
an app restart once passed the old "no `error` key" check and lost two SMS, so
Caddy's `handle_errors` now answers JSON too) *and* only if it is unchanged since it was read (Blu's OTP + debit
arrive a minute apart; deleting blindly once lost the debit) — away from home (the app is VPN-only) nothing is lost; the queue
flushes with the next SMS at home. Messages in a batch are split on a
`~~~fm~~~` line.
- Parser: `packages/core/src/sms/` (pure, tested with a real Bank Refah SMS).
  Reads by shape, not by bank: label glued to value, rial amounts with a
  leading/trailing sign (or برداشت/واریز wording), مانده balance, Jalali
  `MM/DD` with no year (current year unless that lands in the future). Also
  sentence-style banks (Blu: "…، 70,000,000 ریال به حساب شما نشست/پرید", no
  account number, `۱۴۰۵.۰۷.۰۱`, time on its own line). Returns null rather than
  guess — no or both directions, or no date, is not booked.
- `apps/web/src/lib/sms.ts`: every message is stored once in `SmsMessage`
  (unique `householdId+hash` of normalised text → re-delivery is a no-op),
  matched to an **IRR/IRT** account by `Account.smsMatch` — trailing ≥4 digits,
  or for number-less banks a word found on the SMS's first line ("بلو");
  number beats word; ambiguous = no match and booked immediately as a Transaction with
  `origin="SMS"`, `needsReview=true`, `bankBalance`, rial→toman for IRT.
  Messages with no amount-like content (login notices, OTPs) are stored as
  `IGNORED` and never surface; the bank's note line becomes the description.
  Unreadable/unmatched messages stay (`UNPARSED`/`UNMATCHED`) and are retried
  when re-sent or when an account's SMS number is set (`retryUnmatched`).
- **Category rules** (`CategoryRule`, `core/sms/rules.ts`): the Review form's
  "from now on, file X under this category" tick stores the SMS's own
  description (normalised: Arabic letters, ZWNJ, spacing, trailing
  punctuation) → category, per type. `processMessage` applies an exact match
  at booking time (`needsReview=false`, outcome `FILED`), and saving a rule also
  files rows with that description already waiting. A rule can instead
  point at an account (`transferAccountId`): "record as transfer ↔ loan" —
  only to accounts with no `smsMatch`, whose side never arrives as its own SMS.
  Generic kinds
  ("برداشت پول", "خرید", "پرداخت قبض"…) can never be rules — they are on half
  the messages. Listed/deleted in Settings (#rules).
- **Paste box** on `/review` (`pasteSms` → the same `ingestSmsBatch`): for SMS
  the automation never delivered — iOS does skip runs. Blank line separates
  several messages; re-pasting is a harmless duplicate. Blu's "…ریال بابت X از
  حساب شما پرید" gives X as the description (a loan instalment has no header).
  A late SMS is recorded at the bank's printed minute (`smsRecordedAt` →
  `createdAt`): a day's rows are ordered by `createdAt`, and a pasted morning
  deposit otherwise sorted after that day's later SMS and showed as a gap.
- `/review` page (nav badge + a pill in the mobile header): pick a category, or
  "transfer ↔ own account", which turns the row into a TRANSFER and deletes the
  other side's still-unreviewed SMS row (same amount, ±3 days) so own
  transfers are not counted as expense + income. Keys live in Settings (#sms);
  the SMS number per account on the Accounts cards.
- **Category suggestions** (`packages/core/src/sms/suggest.ts`, pure, tested):
  the review page preselects a category learned from already-filed
  transactions — same description (bank note, OTP merchant) or exact amount
  votes, same account breaks ties, recent choices count more, and nothing is
  suggested unless one category clearly leads (a bare "خرید" does not pick
  one). Still one tap to confirm; never auto-filed.
- **OTP merchant pairing:** Blu names the merchant only in the purchase OTP
  ("ازکي"); the debit says "برداشت پول". `merchantFromOtp` pairs a debit with
  an IGNORED OTP of the exact same rial amount received ≤2 h earlier and uses
  the merchant as the description, which is what suggestions learn from.
- **Balance check against the bank** (`packages/core/src/reconcile`, pure;
  `apps/web/src/lib/reconcile.ts`): for each account with SMS balances, the
  latest `bankBalance` is compared with the app's running balance at that same
  transaction (opening + everything ordered by date, then createdAt). A gap
  shows on the account card with two fixes (`settleBalanceGap`, gap recomputed
  server-side): book it as an income/expense dated at that SMS — created 1 ms
  before it so the next comparison counts it, and `needsReview` so it gets a
  category — or fold it into the opening balance. It caught the owner's real
  700-toman Paya fee that Refah never SMSed.

## Monthly summary (`/reports/month?m=<monthKey>`)
One month at a time in the reader's calendar (`monthKeyIn`, e.g. `1405-07`):
income / expenses / net against the previous month, every category side by
side with the change (spending up = red; categories that vanished still show),
the five largest expenses, and a nudge to Review when rows still lack a
category. A finished month is compared with the whole previous month; the month
in progress with the **same number of days** of the previous one
(`previousWindow` in `core/reports/compare.ts`) — ten days against a full month
would always look like a saving. It opens on the month just ended during the
first week of a new month, else the current one (`lib/monthSummary.ts`), and
the dashboard shows "<month> is over — see its summary" in that week if the
month had any transactions. Linked from the Reports header. Reached nowhere
else, so there is no nav item.
The reconcile gap buttons (`SettleGapButtons`) take two clicks: the first asks
whether a transaction of that amount is simply missing, because folding a
not-yet-entered purchase into the opening balance and then entering it counts
it twice — which happened.

## Editing accounts (`updateAccount` in `apps/web/src/app/actions/accounts.ts`)
Pencil button on each account card → `AccountForm` in edit mode (name, type,
currency, opening balance, SMS number — the old separate SMS-number form is
folded in). A **rial ↔ toman** change restates the account's whole history by
exactly 10 in one DB transaction (opening balance unless the user edited it,
transactions and recurring rules in the old currency touching the account,
`bankBalance`) using Prisma's atomic `multiply`/`divide`, so the balance stays
the same money (`rialTomanRescale` in core/currency). It refuses when a
transfer links the account to one in a different currency than the target,
and refuses any other currency pair while the account has history (that would
need a market rate). A transfer that was booked in rial into a toman account
is corrected by the restatement.
Accounts linked by transfers in the same old currency **move together**: the
action walks transfers (and recurring transfer rules) transitively, returns
`{ linked: [names] }` on the first save, and converts the whole group once the
form resubmits with `convertLinked=1`. Converting one side alone was a
deadlock — each account refused because the other was still in rial. The form
submits via `onSubmit` + `useTransition`, not `<form action>`: React resets a
form after an action, which reverted the currency select while the notice
still named the new currency, and would have dropped the checkbox.

## Person (settle-up) accounts — account type `PERSON`
The owner handles money for family (a parent's savings kept in his Blu
account, a spouse's crypto bought from his balance). That money is neither his
income nor his expense, but it moved his numbers. Each such person is an
account of type `PERSON`: negative balance = money held for them, positive =
they owe him. Every movement is a **transfer** (Review → "transfer ↔ person"),
so reports never count it. The Accounts page then splits its totals — **my
money** (everything, net), **in my accounts** (non-PERSON balances), **others'
money I hold** (negative PERSON balances), plus what others owe — and PERSON
cards say it in words ("this much of X's money is with you" / "X owes you
this") instead of showing a sign. No schema change: `Account.type` is a
string; the enum lives in `packages/core/src/constants`.

## Holdings kept for others (`Investment.heldForId`)
Money a family member gave him that he turned into a coin (someone's 114M
toman → 498.95 USDT) is theirs, gains and losses included. A holding can
name a PERSON account as its owner: it is then left out of net worth and
the investments totals, shown as "kept for others", and the person's card
counts it — what they have with you = their account balance (cash) less
those holdings' value, with each holding and its gain listed. Buying and
selling for them moves money through the usual SMS rows ("transfer ↔
person"); the holding itself is edited or partly sold (`sellInvestment`
cuts cost basis in proportion) on /investments.
**Toman prices** (`core/market`, `lib/iranMarket.ts`): the official
USD→IRR rate is far from the market's, so CRYPTO holdings priced in
IRT/IRR are priced from Wallex, Nobitex and Tabdeal's public APIs (the median
of the quotes, one far from the rest dropped; quotes older than a day are shown
but not used). Every quote is stored in `MarketQuote` and shown on
/investments, because the owner compares exchanges before trading. Runs with
the hourly `/api/cron/refresh` and the Refresh button. Endpoints were checked
from the production server: Nobitex answers on `apiv2.nobitex.ir` (not
`api.`, which times out from Germany), Tabdeal has no ticker so its last trade
is used; the core tests carry their real responses. A parser returns null
rather than guess; URLs are env-overridable.

## Self-custody wallets (`Wallet`, `core/wallets`, `lib/wallets.ts`)
The owner's Tangem card (any wallet works) is followed **read-only by its
public addresses** — never a key, seed phrase or access code; the form says
so. One address per network (`ADDRESS_KINDS`; Ethereum and Arbitrum share the
`evm` one). Each chain's keyless public API is read (publicnode EVM RPC,
TronGrid, Toncenter, Solana RPC, NEAR RPC → FastNEAR, xrplcluster → s1.ripple,
BlockCypher for BTC/LTC/DASH — all checked from the production server
2026-09-25, URLs env-overridable as `WALLET_*`), for the coin plus known
tokens (`WALLET_ASSETS`: USDT/USDC/PAXG on Ethereum; USDC native, USDC.e,
Aave aUSDC and USDT on Arbitrum; USDT on Tron). **Tangem's yield mode**
moves USDC/USDT off the address into a per-owner module contract that holds
Aave aTokens (the owner's 117 USDC showed as zero on the address): the
factory's `yieldModules(owner)` view (`TANGEM_YIELD_FACTORY`, selector
`0x36571e2c`) gives the module, whose aToken balance is read as a separate
`…yield` holding. **TON staking** likewise leaves only change on the address
(10.34 Gram read as 0.12): a TON Whales pool keeps the stake. Pools are found
in the address's tonapi history (a transfer out commented "Deposit", kept only
if the contract answers `get_member`), remembered in `Wallet.stakePools` so an
old deposit still counts, and asked hourly for the member's stake (+ pending
deposit + withdrawal ready) as `ton:TON.staked`. tonapi keyless = 1 req/s, so
its calls are spaced. The owner's address also carries a blacklisted "FROZEN
GRAM" scam jetton (phishing for frozengram.xyz); jettons are not read. Each
balance becomes an
`Investment` with `walletId` + `walletAsset` (unique): quantity follows the
chain, cost basis per `walletCostBasis` (new = today's value, arrivals at
today's price, departures cut it in proportion), dust under a cent skipped,
XRP counted above its reserve (as wallet apps show it). In a toman household
new wallet holdings are priced in toman (the exchanges' price for the coin,
else CoinGecko dollars × the exchanges' USDT rate — the official rate is far
off) and rounded to whole toman. Coins the exchanges were never asked about
are asked first (`refreshIranPrices(householdId, alsoSymbols)`), so a new
holding's cost and its later repricing come from the same quotes — the first
live wallet showed Gram at −10% from cost set at dollars × USDT and the price
then taken from Tabdeal. Nobitex answers a whole batch with 400 when it lacks
one coin (it did with the wallet's eight), so `fromNobitex` then asks coin by
coin. Runs in `refreshAll` after the prices and
before the net-worth snapshot, and on saving a wallet. A chain that fails is
recorded on the wallet (`errors`) and its holdings are left as they were —
an outage never zeroes a balance. A TON address's CRC16 is checked: the first
one typed from a screenshot had an l for an I. The wallet card on
/investments shows the total and ≈ dollars to compare with the wallet app.
Additive migration `20260925120000_wallets`.

## Loan accounts — account type `LOAN`
Entered as the remaining debt (positive; `accountSchema` stores it negative
whatever sign was typed). Each instalment is a **transfer** into the loan, not
spending — the spending happened when the loan was taken — so the balance
counts down to zero; a transfer rule makes the monthly SMS ("بازپرداخت بدهی وام
به‌جا") file itself. The card shows the debt in words and "about N more
instalments of X" from the last instalment (`core/loans` `loanStatus`); the
Accounts page shows **loans owed**, and **in my accounts** excludes LOAN like
PERSON. No schema change beyond the rule's `transferAccountId`.
**Transfer balance attribution:** turning a *deposit* SMS into a transfer moves
the row onto the sending account (`accountId` = from), but the SMS's
`bankBalance` belongs to the receiving one, and reconciliation reads it on
`accountId`. `transferLegs` (lib/sms.ts) therefore drops it on that path (or
takes the sending side's own waiting SMS balance, if it was absorbed).

## Budgets (`core/budgets`, `getBudgetProgress`)
Each budget covers its **own period in the reader's calendar** (`budgetWindow`:
a Persian week is Saturday–Friday, a Persian year starts at Nowruz) — until
2026-09-24 every budget was measured by month whatever its period said.
`budgetStatus` gives a level — `over` past the limit, `watch` at 80% or when the
pace would run past it — plus what is left per day for the days remaining. Pace
is not trusted before a fifth of the period has passed (two days of groceries
"project" to a fortune). The dashboard lists budgets at watch/over, worst
first, with the category name in `<bdi>` so a Latin name does not reorder the
Persian line; the monthly summary shows that month's monthly budgets, read at
the month's end.

**Budget planner** (`/budgets/plan`, `core/budgets/plan.ts` — pure, runs live
in the browser): income − savings share − fixed costs (rent + each loan's last
instalment) = what the categories share. With history (average of up to three
full months, never counting months before the household's first transaction)
each category keeps its habit, scaled down if it does not fit — protected
categories cut half as hard — and what is left over shows as extra savings.
Without history a default split by category *kind* (matched by keyword on the
name, fa or en) is used. Groceries, dining and transport get weekly budgets.
Income is suggested from last month's actual income each time (the owner
enters/adjusts it monthly); savings rate, rent, other fixed costs and
protected categories persist in `Household.budgetPlan` (JSON, additive
migration). Applying replaces each planned category's budget (period change
deletes the other period's row); a 0 row removes it.

## Savings goals (`/goals`, `core/goals`, `lib/goals.ts`)
The owner's stated aims (a big purchase, monthly investing) as `Goal` rows:
target, currency, optional date, and how progress is counted — **MANUAL**
(sum of `GoalContribution` rows set aside/taken out from the card; the money
stays mixed with the rest) or **LINKED** (the balances of chosen accounts and
values of own holdings; PERSON/LOAN accounts and holdings kept for others are
refused). `goalProgress` gives share, remaining, months left, per-month need
and a status (`behind` = money share trails the time share since creation by
>5 points). `splitSavings` shares the planner's monthly savings (suggested
income × saved savings rate) between goals: dated goals get remaining ÷ months
left, nearest date first when short; undated ones split the rest evenly, never
past what they lack; shortfall and spare are reported. Shown on /goals, live in
the budget planner (follows the savings % as it changes), and as small bars in
the dashboard's assets card. Additive migration `20260924140000_goals`.

## Net worth over time (dashboard, `core/networth`, `lib/networth.ts`)
Cash is rebuilt exactly for any day: opening balances + income − expense up to
that day (transfers, persons' and loans' included, net to zero). Holdings'
past value cannot be rebuilt, so `NetWorthSnapshot` stores each day's
holdings value and the day's USDT rate, written by `refreshAll` (hourly cron
and the Refresh button; the day's last write stands). Before the first
snapshot a holding counts at cost from its purchase date; afterwards at the
snapshot value, carried over days without one. The dashboard chart has
30/90/365/all ranges and a toman ↔ dollar switch (dollars only from the first
recorded rate — never two scales on one axis). Axis ticks are bare numbers
(compact only ≥ 1M) because "1.8B تومان" wrapped. Additive migration
`20260924160000_net_worth_snapshots`.

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
- Dependency advisories: all cleared (2026-09-24; they were all in vitest/vite, test-only). Recurring rules
  step in the calendar frozen on the rule (`RecurringTransaction.calendar`, set
  from the creator's locale), and months are counted from `startDate`
  (`nextOccurrenceInCalendar`) so a rule for the 31st returns to the 31st after
  a 30- or 29-day month instead of drifting down for good.
  A Jalali `from > to` in the Reports filter falls back to the preset silently,
  since selects cannot express the native input's min/max.
- Bank sync (Plaid) just landed but is sandbox-only and unverified live — get
  free sandbox keys at dashboard.plaid.com, set `PLAID_CLIENT_ID`/
  `PLAID_SECRET`/`PLAID_ENV=sandbox`/`TOKEN_ENCRYPTION_KEY` in `.env`, then
  drive Connect a bank → map → Sync now in a browser (sandbox login
  `user_good`/`pass_good`) before considering it done.
- Otherwise pick up from the "WHERE TO CONTINUE" list above (stock-symbol
  coverage, PDF/Excel export, etc.).
