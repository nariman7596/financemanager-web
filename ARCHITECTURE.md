# ARCHITECTURE.md

FinanceManager — a multi-user, multi-currency personal finance platform for
Web, iOS and Android.

This document defines the **target architecture**. It is written against the
code that already exists in this repository, not against a blank page. Read
[the starting point](#0-the-starting-point-what-already-exists) first: it is
the reason several decisions below differ from what a greenfield answer would
say.

Companion document: [`ROADMAP.md`](./ROADMAP.md) — the phase-by-phase plan to
get from here to there.

---

## 0. The starting point (what already exists)

This repo is **not empty**. It contains a working, privately deployed Next.js
15 application, running on a VPS today. An honest inventory against the
requirements:

### Already built and in production

| Requirement | Status | Where |
| --- | --- | --- |
| PostgreSQL + Prisma | Done | `prisma/schema.prisma` |
| Multi-currency (IRR, USD, CAD) | Done — 13 currencies incl. **IRT/toman** | `src/lib/constants.ts`, `src/lib/currency.ts` |
| EN/FA localization, RTL | Done — 342 symmetric keys, `dir=rtl`, logical CSS properties | `src/lib/i18n/` |
| Persian (Jalali) calendar | Done — display, month bucketing, date entry, report ranges | `src/lib/calendar.ts`, `src/components/DateField.tsx` |
| Income / expense categories | Done (flat, no sub-categories yet) | `Category` model |
| Investments | Done — holdings, cost basis, live price refresh | `Investment`, `src/lib/marketdata.ts` |
| Reporting + charts | Done — Recharts, date ranges, category/member breakdowns, CSV export | `/reports`, `src/lib/queries.ts`, `src/lib/reportCsv.ts` |
| Multi-user | Done — Households, Memberships, 4 roles, invitations | `src/lib/household.ts` |
| Auth | Done — signed httpOnly JWT (`jose` + `bcryptjs`) | `src/lib/jwt.ts`, `src/middleware.ts` |
| Bank sync | Done (Plaid, sandbox-only) | `src/lib/plaid.ts` |
| Docker + CI-built images | Done — GHCR build, VPS pulls only | `.github/workflows/build-image.yml` |
| Backups | Done, restore tested | `deploy/backup.sh`, `deploy/restore.sh` |

### Required by the spec, not yet built

| Gap | Notes |
| --- | --- |
| **Monorepo (Turborepo)** | Single-package npm repo today |
| **Mobile (React Native / Expo)** | Nothing exists |
| **Standalone backend API** | Business logic lives in Next.js Server Actions — invocable only from the web app. Mobile cannot call it. |
| **Offline-first + sync** | Every read is a server-rendered Prisma query. No local store, no sync engine. |
| **SMS parsing** | Nothing exists |
| **Sub-categories** | `Category` is flat; no `parentId`, no `INVESTMENT` category type |
| **Field-level encryption** | Only the Plaid access token is encrypted (`src/lib/crypto.ts`). Descriptions/notes are plaintext. |
| **React Query** | Not used — server components fetch directly |

### What this implies

The work is a **staged migration**, not a rewrite. Two properties must hold at
every step:

1. **The deployed app never breaks.** The VPS pulls `:latest` from GHCR on
   deploy. A red CI build means the server silently keeps the old image — this
   has already happened twice in this project's history. Every phase ends with
   a green build and a working deploy.
2. **Logic is extracted, not re-typed.** `currency.ts`, `calendar.ts`,
   `dateRange.ts`, `validation.ts`, `recurring.ts`, `importer.ts`,
   `reportCsv.ts` and the i18n dictionaries are already pure, tested and
   hard-won (the Jalali bucketing in particular). They move into shared
   packages unchanged. Rewriting them for a mobile client would reintroduce
   bugs that are already fixed.

---

## 1. Decisions requiring your approval

Per the workflow rule, these are the choices that change the shape of the
project. **Nothing is implemented until you approve them.**

### D1 — Backend: one domain, two transports (not a big-bang NestJS rewrite)

**The problem.** All business logic currently lives in Next.js Server Actions
(`src/app/actions/*.ts`). A Server Action is an RPC endpoint that only a React
client of the same Next.js app can call. React Native cannot use it. The spec
asks for "Node.js (NestJS or Express)".

**Rejected option — port everything to NestJS at once.** Rewriting ~10 action
modules, 9 pages and every form into API calls in one step is weeks of work
where nothing ships, and the deployed app is at risk the entire time.

**Recommended option — extract the domain, then add a second transport.**

```
                      ┌──────────────────────┐
apps/web  ──────────► │  Server Actions      │ ─┐
(Next.js, RSC)        │  (thin adapters)     │  │
                      └──────────────────────┘  │   ┌────────────────────┐
                                                ├──►│  packages/core     │
                      ┌──────────────────────┐  │   │  domain services   │──► packages/db
apps/mobile ─────────►│  apps/api (NestJS)   │ ─┘   │  (pure + Prisma)   │    (Prisma)
(Expo, HTTP)          │  REST controllers    │      └────────────────────┘
                      └──────────────────────┘
```

Business rules — household scoping, role gates, recurring posting, currency
conversion, sync — live once in `packages/core`. Server Actions become
30-line adapters over them; NestJS controllers become 30-line adapters over
the same functions. There is **one** implementation of "can this user write to
this household", tested once.

Cost: the web app keeps a direct DB connection rather than going through HTTP.
That is a deliberate trade — server components rendering through an HTTP hop
to their own backend adds latency and a failure mode for no benefit on a
single-VPS deployment. If you later split web and API onto different hosts,
swapping `packages/core` calls for `packages/api-client` calls in `apps/web`
is a mechanical change, and by then the API is already proven by mobile.

**Approve D1 to proceed with the staged approach; say so if you want the
full NestJS migration up front instead.**

### D2 — Package manager: npm → pnpm

Turborepo works with either, but npm workspaces hoist unpredictably, and
React Native is notoriously sensitive to duplicated `react`/`react-native`
copies in `node_modules`. pnpm's strict layout prevents that class of bug.

Cost: `package-lock.json` → `pnpm-lock.yaml`, and both the `Dockerfile` and
`build-image.yml` must change together. A stale lockfile already broke CI in
this project once, so this lands as its own commit with a verified build.

### D3 — Encryption boundary: what is encrypted, and what that costs

The spec says "data encryption must be implemented for sensitive financial
records." That phrase hides a real trade-off, so it needs an explicit answer.

| Tier | Covers | Cost |
| --- | --- | --- |
| Transport | TLS everywhere (SSH tunnel today) | none |
| Volume at rest | LUKS on the VPS + encrypted backups (`age`) | none |
| **App-level (recommended)** | `Transaction.description`, `.notes`, `.rawSms`, `Account.institutionRef`, Plaid tokens — AES-256-GCM, per-household DEK wrapped by a master KEK | free-text search on those fields must move client-side |
| Amounts and dates | **NOT encrypted** | see below |
| E2EE (opt-in, later) | DEK derived from a user passphrase; server cannot decrypt | server-side reports on narrative fields become impossible; password reset means data loss |

**Why amounts stay queryable.** Encrypting `Transaction.amount` would make
`SUM()`, `GROUP BY category`, budget checks and every report impossible in
SQL. All aggregation would have to happen on-device over the full decrypted
history. For a household ledger with tens of thousands of rows that is a
genuine architectural downgrade for a marginal threat-model gain — an attacker
holding your database also holds category names, timestamps and account
structure, from which spending is trivially inferable.

Recommendation: **Tier 1 + 2 + 3 now, Tier 5 (E2EE) as an opt-in mode later**,
once reports are proven to work client-side against the offline store (which
Phase 7 builds anyway). Mobile's local SQLite is encrypted with SQLCipher, key
in Keychain / Android Keystore, regardless of tier.

### D4 — Android SMS reading: a Play Store policy constraint you should know now

`READ_SMS` / `RECEIVE_SMS` are **restricted permissions** under Google Play
policy. Play grants them essentially only to apps that are the user's default
SMS handler, or that fall into a short list of approved use cases. *"Parsing
bank transaction SMS to track finances" was explicitly removed from that
list.* Personal-finance apps that still do this are typically distributed
outside Play, or shipped in regions/stores with different rules.

Three viable paths, in order of preference:

1. **Smart Paste everywhere (all platforms, no permission).** User copies the
   SMS, taps paste, the parser fills the form. Works on iOS and Web too, which
   the spec already requires. **This is the primary feature.**
2. **Android share-sheet target.** The app registers as a share target for
   text; the user long-presses the SMS → Share → FinanceManager. One tap, zero
   restricted permissions, Play-compliant.
3. **Full `READ_SMS` auto-ingest.** Best UX by far. Requires either
   self-distribution (APK / F-Droid — plausible given you already self-host
   privately) or a Play permissions declaration that may be rejected.

Architecturally these are the same feature: the parser is a pure function in
`packages/sms`, and the three paths are just different input sources. So (3)
can be added later behind a build flag without redesign. **Confirm which
distribution channel you want for Android**, since it decides whether (3) is
ever reachable.

### D5 — VPS memory budget

Your server is 1 vCPU / 961 MB + 2 GB swap, and cannot build this app (hence
CI-built images). Adding a NestJS process changes the runtime budget:

| Process | Resident |
| --- | --- |
| Next.js (`next start`) | ~250 MB (measured) |
| NestJS API | ~120 MB (estimated) |
| Postgres | ~150 MB |
| **Total** | **~520 MB** of 961 MB |

Workable, with headroom for swap-free operation. But mobile sync will add
sustained request load to a 1-vCPU box. Budget for a memory/CPU check at the
end of Phase 6, and a possible bump to 2 GB before the mobile launch.

---

## 2. Monorepo folder structure

```
financemanager/
├── apps/
│   ├── web/                     # Next.js 15 App Router — today's src/ moves here
│   │   ├── src/app/             #   routes, layouts, server actions (thin adapters)
│   │   ├── src/components/      #   web-only React components
│   │   └── next.config.mjs
│   │
│   ├── mobile/                  # Expo (React Native), iOS first
│   │   ├── app/                 #   expo-router file-based routes
│   │   ├── src/features/        #   screen-level composition
│   │   ├── src/db/              #   SQLCipher schema + migrations (local mirror)
│   │   └── app.config.ts        #   EAS profiles, permissions, i18n/RTL setup
│   │
│   └── api/                     # NestJS — the transport mobile talks to
│       ├── src/modules/         #   auth, households, transactions, sync, sms
│       ├── src/guards/          #   HouseholdGuard (mirrors lib/household.ts)
│       └── src/main.ts
│
├── packages/
│   ├── core/                    # THE DOMAIN — no framework imports
│   │   ├── money/               #   Decimal arithmetic, formatMoney, IRT handling
│   │   ├── currency/            #   conversion, triangulation through USD
│   │   ├── calendar/            #   Gregorian ⇄ Jalali, month bucketing
│   │   ├── dateRange/           #   preset/from/to resolution (pure)
│   │   ├── recurring/           #   due-occurrence engine
│   │   ├── reports/             #   query cores + CSV builders
│   │   ├── validation/          #   zod schemas — the single source of truth
│   │   ├── access/              #   role ranks, household gate policy (pure)
│   │   └── sync/                #   protocol types, conflict resolution rules
│   │
│   ├── db/                      # Prisma: schema, migrations, generated client, seed
│   │
│   ├── api-client/              # generated-from-OpenAPI typed client
│   │   └── react-query/         #   shared hooks: useTransactions, useAddTransaction…
│   │
│   ├── client-core/             # OFFLINE ENGINE — platform-agnostic
│   │   ├── store/               #   LocalStore interface
│   │   ├── adapters/sqlite/     #   expo-sqlite  (mobile)
│   │   ├── adapters/idb/        #   IndexedDB    (web PWA)
│   │   ├── outbox/              #   durable mutation queue
│   │   └── engine/              #   pull/push loop, cursors, retry, conflict log
│   │
│   ├── sms/                     # SMS → Transaction draft (pure, no I/O)
│   │   ├── templates/           #   per-bank regex rule packs (fa + en)
│   │   ├── normalize/           #   Persian/Arabic digit folding, ٬ separators
│   │   └── fixtures/            #   redacted corpus + snapshot tests
│   │
│   ├── i18n/                    # dictionaries (en, fa) + createT + formatters
│   ├── ui/                      # design tokens; RN + web primitives (added Phase 8)
│   └── config/                  # shared tsconfig / eslint / tailwind / jest presets
│
├── deploy/                      # Caddy, cron container, backup.sh / restore.sh
├── docker-compose.{dev,private,ghcr}.yml
├── Dockerfile                   # builds apps/web
├── docker-entrypoint.sh
│
├── docs/                        # existing deployment + workflow guides
├── ARCHITECTURE.md
├── ROADMAP.md
├── turbo.json
└── pnpm-workspace.yaml
```

**Why the deployment files stay at the repository root.** An earlier draft of
this document put them under `infra/`. They are not: the VPS holds a git clone
and deploys with `docker compose -f docker-compose.ghcr.yml pull` from the
repository root, and `docs/DEPLOY-PRIVATE.md` (in Persian) documents that path
throughout. Moving them would break the deploy command on the next `git pull`
for a purely cosmetic gain. File paths that an operator types are a production
interface, so they are treated like one.

**Dependency rule (enforced by lint):** `packages/core` imports nothing from
`apps/*`. `apps/*` may import from `packages/*`. `packages/core` must stay
free of `next/*`, `react-native`, `react` and Node-only APIs so it runs
identically in a browser, in Hermes and on the server. `packages/db` is the
only package that imports `@prisma/client`.

---

## 3. Database schema

Prisma, PostgreSQL. Below is the target state. Fields marked **NEW** do not
exist today; everything else is already in `prisma/schema.prisma` and is
reproduced here so the whole model reads as one thing.

### Identity and tenancy

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  passwordHash String                          // bcrypt
  baseCurrency String   @default("USD")
  locale       String   @default("en")         // en | fa
  totpSecret   String?                         // NEW — encrypted, 2FA (Phase 14)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships  Membership[]
  devices      Device[]                        // NEW
  refreshTokens RefreshToken[]                 // NEW
}

// A shared financial space. A solo user has a household of one.
// Ownership is Household-scoped, never User-scoped. This is the security core.
model Household {
  id           String   @id @default(cuid())
  name         String
  baseCurrency String   @default("USD")
  syncRevision BigInt   @default(0)            // NEW — monotonic change counter
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  members      Membership[]
  invitations  Invitation[]
  accounts     Account[]
  categories   Category[]
  transactions Transaction[]
  budgets      Budget[]
  investments  Investment[]
  recurring    RecurringTransaction[]
  plaidItems   PlaidItem[]
  key          HouseholdKey?                   // NEW
}

model Membership {
  id          String   @id @default(cuid())
  householdId String
  userId      String
  role        String   @default("MEMBER")      // OWNER | ADMIN | MEMBER | VIEWER
  createdAt   DateTime @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId],      references: [id], onDelete: Cascade)

  @@unique([householdId, userId])
  @@index([userId])
}
```

### Categories — sub-category support (NEW)

The spec asks for Income / Expenses / **Investments**, each with practical
sub-categories. Today `Category.type` is `INCOME | EXPENSE` and the tree is
flat.

```prisma
model Category {
  id          String   @id @default(cuid())
  householdId String
  parentId    String?                          // NEW — self-relation, ONE level deep
  createdById String?
  name        String
  type        String   @default("EXPENSE")     // INCOME | EXPENSE | INVESTMENT   (NEW value)
  color       String   @default("#328eff")
  icon        String?
  isArchived  Boolean  @default(false)
  isSeeded    Boolean  @default(false)         // NEW — makes relabelDefaults explicit
  createdAt   DateTime @default(now())

  // --- sync envelope (NEW, present on every syncable model) ---
  revision    BigInt   @default(0)
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  lastWriterDeviceId String?

  household Household  @relation(fields: [householdId], references: [id], onDelete: Cascade)
  parent    Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  Category[] @relation("CategoryTree")

  @@unique([householdId, parentId, name, type])
  @@index([householdId, revision])
}
```

Design notes:

- **Exactly one level of nesting.** Arbitrary depth makes every report a
  recursive CTE and every budget ambiguous. A parent groups its children —
  **and may still hold transactions directly**, with reports rolling children
  up into it. An earlier draft of this document said only leaves may take
  transactions; that would have orphaned every transaction already filed
  against a top-level category the moment it gained children.
- **`seedKey` replaces name-matching** (the plan said `isSeeded`; a key is
  strictly better). `relabelDefaults` decided "did the user rename this?" by
  comparing against a list of seeded names, which mislabels a category the user
  renamed to text that collides with another locale's seed. Storing *which*
  default the row came from cannot collide, and the migration backfills it.
- **Uniqueness needs two partial indexes, not one `@@unique`.** The obvious
  `@@unique([householdId, parentId, name, type])` silently fails: Postgres
  treats NULLs as distinct in a unique index, so two top-level categories with
  the same name both insert and quietly split the household's reports in two.
  Verified against a real Postgres. The migration creates one partial unique
  index for siblings (`parentId IS NOT NULL`) and one for roots
  (`parentId IS NULL`). Postgres 15+ could say `NULLS NOT DISTINCT`, but Prisma
  cannot emit it and partial indexes work everywhere.

  The same NULL-distinctness is *desirable* one table over: `@@unique
  ([householdId, smsHash])` lets any number of manually-entered rows carry a
  NULL hash while still rejecting the same message twice.
- **`INVESTMENT` category type** is for *cash flows* into/out of investments
  (contributions, dividends, fees). It is distinct from the `Investment`
  model, which is a *holding*. Keeping them separate is what lets "money I put
  into investing this month" appear in cash-flow reports without double
  counting the portfolio's mark-to-market value.

### Transactions

```prisma
model Transaction {
  id          String   @id                     // client-generated UUIDv7 for offline rows
  householdId String
  createdById String?
  accountId   String
  categoryId  String?
  type        String   @default("EXPENSE")     // INCOME | EXPENSE | TRANSFER
  amount      Decimal                          // always positive; `type` gives direction
  currency    String   @default("USD")
  date        DateTime @default(now())

  description       String?                    // ENCRYPTED (Phase 5)
  notes             String?                    // ENCRYPTED (Phase 5)
  transferAccountId String?
  recurringId       String?

  // --- provenance (NEW) — where did this row come from? ---
  origin        String  @default("MANUAL")     // MANUAL | IMPORT | PLAID | SMS | RECURRING
  rawSms        String?                        // ENCRYPTED — the source message
  smsHash       String?                        // sha256(normalized body) — SMS dedup key
  smsConfidence Float?                         // parser confidence 0..1
  needsReview   Boolean @default(false)        // low-confidence rows land in a review queue

  plaidTransactionId String? @unique           // Plaid dedup key
  pending            Boolean @default(false)

  // --- sync envelope (NEW) ---
  revision  BigInt    @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  lastWriterDeviceId String?

  household       Household  @relation(fields: [householdId], references: [id], onDelete: Cascade)
  account         Account    @relation("AccountTransactions", fields: [accountId], references: [id], onDelete: Cascade)
  transferAccount Account?   @relation("TransferAccount",     fields: [transferAccountId], references: [id])
  category        Category?  @relation(fields: [categoryId], references: [id])

  @@unique([householdId, smsHash])             // an SMS can only become one transaction
  @@index([householdId, revision])             // THE sync pull index
  @@index([householdId, date])                 // reporting
  @@index([accountId])
  @@index([categoryId])
}
```

**On ids.** Offline creation requires the client to mint the id before the
server has seen the row. The column is already `String`, so client-generated
**UUIDv7** (time-sortable, collision-safe) coexists with the existing `cuid()`
rows with no data migration — only the default changes for new rows. UUIDv7's
time ordering also gives sensible index locality for the sync pull.

### Sync and device tables (all NEW)

```prisma
// A registered installation. Sync cursors are per-device, not per-user:
// a phone and a laptop pull independently.
model Device {
  id            String   @id                   // client-generated UUID
  userId        String
  platform      String                         // IOS | ANDROID | WEB
  name          String?                        // "Nariman's iPhone"
  pushToken     String?
  lastSeenAt    DateTime @default(now())
  createdAt     DateTime @default(now())

  user    User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  cursors SyncCursor[]
  @@index([userId])
}

// Where this device has read up to, per household.
model SyncCursor {
  deviceId     String
  householdId  String
  lastRevision BigInt   @default(0)
  lastSyncedAt DateTime @default(now())

  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  @@id([deviceId, householdId])
}

// Idempotency ledger. A push retried after a network timeout must not
// double-apply. Pruned after 30 days.
model SyncOperation {
  opId            String   @id                 // client-generated UUID per mutation
  deviceId        String
  householdId     String
  entity          String                       // "transaction" | "category" | …
  entityId        String
  appliedRevision BigInt
  appliedAt       DateTime @default(now())

  @@index([householdId, appliedAt])
}

// A write that lost to a concurrent write. Surfaced in the UI, never dropped.
model SyncConflict {
  id           String   @id @default(cuid())
  householdId  String
  entity       String
  entityId     String
  losingPayload Json                           // ENCRYPTED if it holds narrative fields
  winningRevision BigInt
  resolvedAt   DateTime?
  createdAt    DateTime @default(now())

  @@index([householdId, resolvedAt])
}

// Refresh-token rotation for mobile (Phase 4). One row per live session;
// reuse of a rotated token revokes the whole family (theft detection).
model RefreshToken {
  id         String   @id @default(cuid())
  userId     String
  deviceId   String
  tokenHash  String   @unique                  // sha256 — never store the token
  familyId   String
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, familyId])
}

// Envelope encryption: one data key per household, wrapped by the master KEK.
model HouseholdKey {
  householdId String   @id
  wrappedDek  String                           // AES-256-GCM(KEK, DEK)
  keyVersion  Int      @default(1)
  rotatedAt   DateTime @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
}
```

Unchanged from today and carried forward as-is: `Invitation`, `Account`,
`Budget`, `Investment`, `RecurringTransaction` (including its `calendar` field
— the Jalali stepping fix), `PlaidItem`, `ExchangeRate`. Each syncable one
gains the same four-field sync envelope.

---

## 4. Offline-first sync

### Principles

1. **The local database is the UI's only data source.** No screen ever waits
   on the network. React Query reads from the local store; the sync engine
   writes to it in the background. This is what makes the app feel instant and
   what makes offline a non-event rather than a mode.
2. **The server assigns order, not the client.** Device clocks are wrong —
   phones travel across timezones, users change the date. Every server-side
   write increments `Household.syncRevision` inside the same transaction and
   stamps the row. That counter is the *only* ordering authority.
3. **Every mutation is idempotent.** Client-generated `opId` + the
   `SyncOperation` ledger. A push retried after a timeout applies once.
4. **Nothing is deleted, only tombstoned.** `deletedAt` propagates; hard
   deletes are a server-side sweep after all devices have moved past them.
5. **Derived data is never synced.** Balances, budget usage, portfolio value
   and report totals are computed from transactions on whichever side needs
   them. Syncing a balance guarantees it will eventually disagree with its own
   ledger.

### The local store

`packages/client-core` defines one `LocalStore` interface with two adapters:

| Platform | Adapter | Encryption |
| --- | --- | --- |
| iOS / Android | `expo-sqlite` (SQLCipher) | key in Keychain / Android Keystore |
| Web PWA | IndexedDB | Web Crypto, key in a non-extractable `CryptoKey` |

The schema mirrors the server's, plus two local-only tables: `outbox` and
`sync_meta`. Because both adapters implement the same interface, the sync
engine, the query layer and every React Query hook are written once and shared
by `apps/web` and `apps/mobile`.

### The write path

```
User taps Save
   │
   ├─ 1. validate with the zod schema from packages/core   (same rules as server)
   ├─ 2. mint id = uuidv7(), opId = uuid()
   ├─ 3. write the row to the local DB, revision = 0, dirty = true
   ├─ 4. append {opId, entity, id, op, payload, baseRevision} to the outbox
   └─ 5. React Query invalidates → UI updates                    ← ~5 ms, offline-safe
                                    ↓
                          (sync engine, whenever there is a network)
                                    ↓
            POST /sync/push  { deviceId, ops: [...] }
                                    ↓
            server: for each op, in ONE transaction per batch —
              • seen this opId already? → return the stored result, do nothing
              • authorize: does this device's user hold ≥ MEMBER in this household?
              • conflict check: op.baseRevision vs row.revision
              • apply, revision = ++Household.syncRevision
              • record SyncOperation
                                    ↓
            response: { applied: [{opId, id, revision}], conflicts: [...], newRevision }
                                    ↓
            client: clear those outbox entries, stamp revisions, dirty = false
```

### The read path

```
Sync engine (on launch, on foreground, on reconnect, every 5 min, on push)
   │
   └─ GET /sync/changes?householdId=…&since=<lastRevision>&limit=500
          → { changes: [{entity, id, revision, deletedAt, ...fields}], nextCursor, hasMore }
                     ↓
          apply to local DB in one transaction, ordered by revision
          skip any row that has a pending outbox entry (local wins until pushed)
                     ↓
          lastRevision = nextCursor;  loop while hasMore
                     ↓
          React Query invalidates the affected keys → screens re-render
```

Pull is a single indexed range scan per household
(`@@index([householdId, revision])`), which is why the counter is per-household
rather than global: a device pulls only its own households' changes, and the
query stays O(changes) regardless of total table size.

### Conflicts

Two devices edit the same transaction offline. Both push. The second push
carries a `baseRevision` older than the row's current `revision`.

Policy — **row-level last-writer-wins, with the loser preserved**:

- The later-arriving write wins the row.
- The losing payload is written to `SyncConflict` and pushed to clients as a
  reviewable item ("This transaction was edited on two devices — keep yours?").
  Financial data is never silently discarded.
- **A delete always beats an edit.** Resurrecting a transaction the user
  deliberately deleted is worse than losing an edit to it.
- **Creates never conflict.** Client-generated UUIDs mean two offline creates
  are two distinct rows, which is correct — two people really did add two
  transactions.

Field-level merging (CRDT / per-field timestamps) is deliberately *not* used.
A transaction is a small, atomic, human-authored record; merging one device's
amount with another's category produces a row neither person entered. The
complexity is real and the benefit here is negative.

### Ordering and dependencies

The outbox is FIFO per household and preserves referential order: a
transaction referencing an offline-created account is pushed after that
account. `packages/core` exposes the entity dependency order
(`account → category → transaction → budget`), and the push batch is sorted by
it. The server validates FK targets within the batch, so a whole batch either
lands or fails together.

### Failure handling

| Failure | Behavior |
| --- | --- |
| No network | Outbox grows. UI unaffected. Retry with exponential backoff + jitter, capped at 5 min. |
| Server 5xx | Same as no network. |
| 401 | Refresh the access token; if refresh fails, keep the outbox and prompt re-login. **Never drop pending writes on auth failure.** |
| 409 conflict | Recorded in `SyncConflict`, surfaced in the UI, outbox entry cleared. |
| 400 validation | Row flagged invalid locally with the server's message; entry removed from the outbox so it cannot block the queue. |
| Outbox head poisoned | After N failures a single op is quarantined and the queue continues — one bad row never freezes sync. |

---

## 5. SMS parsing

One pure parser, three input sources.

```
packages/sms
   normalize()   Persian/Arabic digits → ASCII, ٬ and , separators, ZWNJ, RTL marks
        ↓
   detectBank()  match against the template registry (sender id + body shape)
        ↓
   parse()       → { amount, currency, date, direction, balance?, merchant?,
                     accountRef?, confidence, matchedTemplate }
        ↓
   toDraft()     map to a Transaction draft: resolve account by accountRef,
                 guess category from merchant history, set origin=SMS,
                 needsReview = confidence < 0.8
```

Properties that matter:

- **Pure and offline.** No network, no AI in the default path. It runs
  identically on-device in Hermes, in the browser, and on the server.
- **Templates are data, not code.** Each bank is a declarative rule pack
  (sender patterns, regexes with named groups, amount/date formats, currency,
  direction keywords). Adding a bank is a data file plus fixtures — no logic
  change, no app release once the registry is served from the API.
- **Confidence, not certainty.** A parse below threshold creates a
  `needsReview` draft rather than a silent transaction. Money the user did not
  enter must never appear unannounced.
- **Deduplicated by `smsHash`.** `sha256(normalized body)` with a unique
  constraint on `[householdId, smsHash]` means the same message read by the
  Android reader *and* pasted manually creates one transaction, not two. This
  is the dedup key the CSV importer notably still lacks.
- **`rawSms` is encrypted** (Tier 2, D3) — bank messages contain balances and
  partial account numbers.
- **AI is an explicit, opt-in fallback.** When the regex layer fails, the user
  may tap "try smart parse", which sends the *redacted* message (digits
  masked except the amount) to the API for an LLM parse. Off by default,
  disclosed in the UI, never automatic. Iranian bank SMS formats are stable
  and few, so the rule engine should handle the overwhelming majority.

Initial template targets (Iran): Melli, Mellat, Saderat, Saman, Pasargad,
Tejarat, Blu, Ayandeh. Plus generic CAD/USD templates for common Canadian
and US bank alerts.

---

## 6. Authentication

Web keeps today's httpOnly cookie session — it is correct for server-rendered
React and immune to XSS token theft. Mobile cannot use it (no cookie jar
across app restarts, no CSRF model), so the API adds a token flow:

```
POST /auth/login  { email, password, device: {id, platform, name} }
  → { accessToken (JWT, 15 min), refreshToken (opaque, 60 d), user, households }

  accessToken   → memory only, sent as Authorization: Bearer
  refreshToken  → expo-secure-store (Keychain / Keystore), NEVER AsyncStorage

POST /auth/refresh { refreshToken }
  → rotates: old token revoked, new pair issued, same familyId
  → reuse of an already-rotated token revokes the entire family  (theft detection)
```

Both transports resolve the same `HouseholdContext { userId, householdId, role }`
through `packages/core/access`, so the guarantee that already holds today —
*a forged household cookie grants nothing, because membership is verified
against the database* — holds identically for the API. That property is
covered by tests and must not regress.

---

## 7. Localization, currency and calendar

Already solved; the work is extraction, not design.

- **Dictionaries** (`en.ts`, `fa.ts`) move to `packages/i18n` and must stay
  key-symmetric — a CI check enforces this (they are 342 keys each today).
- **RTL.** Web uses `dir="rtl"` and logical CSS properties. React Native uses
  `I18nManager.forceRTL` — note this requires an app reload to take effect, so
  the language switcher on mobile shows a restart prompt. Layouts must use
  `start`/`end`, never `left`/`right`.
- **Calendar.** `packages/core/calendar` keeps the `date-fns` /
  `date-fns-jalali` switch. The rule that boundaries, bucket keys and labels
  must all come from the same calendar is a correctness requirement, not a
  cosmetic one: Mordad 1405 runs 23 July – 22 August, so bucketing a Gregorian
  August total under مرداد misreports it.
- **Currency.** IRR, USD, CAD are the spec's targets; all three exist, along
  with **IRT (toman)**, which has no ISO code — `Intl` renders it as the
  literal "IRT", so `formatMoney` handles it directly, and its rate is derived
  from IRR at exactly 10:1 rather than fetched. Toman is what Iranians
  actually quote prices in, so SMS parsing must handle both units and the
  10× ambiguity explicitly.
- **Dates in storage stay Gregorian UTC**, always. Jalali is a display and
  bucketing concern only. Sync payloads, the API and CSV export are ISO-8601
  UTC without exception.

---

## 8. Development environment (Mac Mini + Linux laptop)

```
docker compose -f docker-compose.dev.yml up -d          # Postgres :5432
pnpm install
pnpm db:push && pnpm db:seed
pnpm dev                                               # turbo runs web + api + expo
```

- **Node version pinned** via `.nvmrc` + `packageManager` in the root
  `package.json`, so `corepack` gives both machines the same pnpm.
- **Postgres in Docker on both machines** — identical to production. No SQLite
  fallback anywhere; the two engines disagree about exactly the things a
  finance app cares about (decimals, timezones, collation).
- **`.devcontainer/`** added in Phase 1 so the Linux laptop and the Mac Mini
  are byte-identical if you want that; Docker Desktop on macOS runs the same
  images either way.
- **Mobile** is the one asymmetry: iOS builds require macOS, so the Mac Mini
  is the iOS build host. Android and everything else work on both. EAS Build
  can also build iOS in the cloud, which keeps the Linux laptop unblocked.
- **CI stays the build authority.** The VPS cannot build (1 vCPU / 961 MB —
  a Next.js build OOM-killed sshd there). GitHub Actions builds and publishes
  to GHCR; the server only pulls. This does not change.

---

## 9. Testing and quality gates

| Layer | Tool | What it protects |
| --- | --- | --- |
| `packages/core` | Vitest, unit | money math, Jalali bucketing, recurring due dates, role policy, conflict rules |
| `packages/sms` | Vitest, snapshot over a redacted fixture corpus | every template, every bank, in both digit systems |
| `packages/client-core` | Vitest against an in-memory `LocalStore` | outbox ordering, idempotent replay, conflict handling, poisoned-head quarantine |
| `apps/api` | Supertest + a throwaway Postgres | auth, **household isolation**, sync protocol |
| Sync end-to-end | scripted two-device simulation | offline edit → reconnect → converge |
| `apps/web` | Playwright, EN + FA, light + dark | critical paths |
| `apps/mobile` | Maestro | login → add transaction → offline → sync |

Non-negotiable gates before any push, because CI failure means the VPS
silently keeps running the previous image:

```
pnpm typecheck      # tsc --noEmit across every package
pnpm test
pnpm build
```

Plus a permanent isolation test: **a member of household A must never, by any
route, read a row belonging to household B** — including with a forged
`fm_household` cookie or a forged `householdId` in an API body. That test
exists today and must survive every phase.

---

## 10. Non-goals

Stated explicitly so they do not creep in:

- **Not a bank.** No payment initiation, no money movement. Read-only
  aggregation plus manual entry.
- **No multi-region or horizontal scale.** One VPS, one Postgres. The design
  targets a household, not a SaaS tenancy model.
- **No real-time collaborative editing.** Sync is periodic and pull-based;
  push notifications only nudge a pull.
- **No arbitrary category nesting** (see §3).
- **No web SMS reading.** Browsers cannot read SMS. Smart Paste is the web
  path, by definition.

---

## Appendix — decision log

| # | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D1 | Extract domain to `packages/core`; NestJS as a second transport, not a rewrite | Keeps the deployed app working; one implementation of the security core | **Awaiting approval** |
| D2 | npm → pnpm | React Native breaks on duplicated `react-native` copies | **Awaiting approval** |
| D3 | Encrypt narrative fields; leave amounts/dates queryable | Encrypting amounts forfeits all SQL aggregation | **Awaiting approval** |
| D4 | Smart Paste primary; `READ_SMS` only if distributing outside Play | Google Play restricts `READ_SMS` and removed finance-SMS as an approved use case | **Awaiting decision on distribution** |
| D5 | Watch the 961 MB memory budget; plan a possible bump before mobile launch | Adding the API costs ~120 MB on a box that cannot swap comfortably | Noted |
| — | UUIDv7 for new rows, coexisting with existing `cuid()` | Offline creation needs client-minted ids; no migration required | Proposed |
| — | Row-level LWW + preserved loser, delete-beats-edit | Field merging invents records no human entered | Proposed |
| — | One level of category nesting | Deeper trees make every report a recursive CTE | Proposed |
