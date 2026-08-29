# ROADMAP.md

The path from the app that exists today to the cross-platform, offline-first
product described in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## How to read this

- Phases are **sequential** unless marked *parallelizable*. Each is sized to
  land in one to three working sessions.
- Every phase names its **exit criteria**. A phase is not done until they all
  hold — "it builds" is not an exit criterion by itself.
- Every phase ends **green and deployable**. The VPS pulls `:latest` from
  GHCR, so a red CI build means the server silently keeps running the old
  image. That has already happened twice in this project. `pnpm typecheck`,
  `pnpm test` and `pnpm build` pass locally *before* every push.
- One branch per phase, off `main`, merged when the exit criteria hold.

**Legend:** 🔒 touches the security core · ⚠️ has a rollback plan · 🔁 pure
refactor, no behavior change

---

## Phase 0 — Planning and architecture ✅ *(this step)*

`ARCHITECTURE.md` + `ROADMAP.md`. No functional code.

**Exit:** you have approved decisions **D1–D4** in the architecture decision
log (backend strategy, pnpm, encryption boundary, Android distribution). Those
answers set the shape of Phases 1, 4, 5 and 10.

---

## Phase 1 — Monorepo skeleton 🔁 ⚠️
*Branch: `feat/monorepo-skeleton`*

Turn the single-package repo into a Turborepo workspace **without changing a
single line of application behavior**.

1. Adopt pnpm workspaces (D2); pin Node via `.nvmrc` + `packageManager`.
2. Move the app: `src/`, `prisma/`, configs → `apps/web/`.
3. Add `turbo.json` with the `dev` / `build` / `typecheck` / `test` pipelines.
4. Create `packages/config` (shared tsconfig, eslint, tailwind, vitest presets).
5. Leave the deployment entry points (`Dockerfile`, `docker-compose*.yml`,
   `docker-entrypoint.sh`, `deploy/`) at the repository root — the VPS deploys
   from a clone by those exact paths, so an `infra/` move would break it.
6. Update `Dockerfile` and `.github/workflows/build-image.yml` for the new
   layout and pnpm.

**Exit criteria**
- `pnpm build` green; CI publishes an image; **the VPS deploys it and the app
  works** — this is the real test, not the build.
- `git log --follow` still traces file history (use `git mv`).
- Zero diffs in application logic. The whole phase is moves and configs.

**Rollback:** the previous GHCR image tag is still deployable. Verify that
before merging.

**Risk:** the Dockerfile and the lockfile must change together. A stale
lockfile already broke CI here once.

---

## Phase 2 — Extract the domain into `packages/core` 🔁
*Branch: `feat/extract-core`*

Move the already-pure, already-correct logic out of the Next.js app so mobile
and the API can share it. **No rewrites** — these modules encode hard-won
fixes (Jalali bucketing, the toman rate, recurring calendar stepping).

| From `apps/web/src/lib/` | To `packages/core/` |
| --- | --- |
| `currency.ts`, `utils.ts` (money) | `money/`, `currency/` |
| `calendar.ts` | `calendar/` |
| `dateRange.ts` | `dateRange/` |
| `validation.ts`, `constants.ts` | `validation/` |
| `roles.ts` | `access/` |
| `recurring.ts` (pure parts) | `recurring/` |
| `reportCsv.ts`, `csv.ts`, `importer.ts` (pure parts) | `reports/`, `csv/` |
| `i18n/` | → `packages/i18n` |

`prisma/` → `packages/db`, which becomes the only package importing
`@prisma/client`.

**Exit criteria**
- `packages/core` imports nothing from `next/*`, `react`, `react-native` or
  Node built-ins — enforced by an eslint boundary rule, not by convention.
- Vitest suites for money, currency triangulation, Jalali bucketing, date
  ranges and recurring due dates. Existing behavior is pinned by tests
  *before* the move, so the move is provably safe.
- `pnpm typecheck` clean; en/fa dictionaries still key-symmetric (CI check).
- The web app is byte-identical in behavior.

---

## Phase 3 — Schema evolution ⚠️
*Branch: `feat/schema-sync-foundations`*

One migration adding everything later phases need, so there is exactly one
risky database change instead of five.

1. **Sub-categories:** `Category.parentId` (self-relation, one level),
   `INVESTMENT` added to the category types, `isSeeded` flag.
2. **Sync envelope** on every syncable model: `revision BigInt`, `deletedAt`,
   `lastWriterDeviceId` (`updatedAt` already exists);
   `Household.syncRevision`.
3. **New tables:** `Device`, `SyncCursor`, `SyncOperation`, `SyncConflict`,
   `RefreshToken`, `HouseholdKey`.
4. **Provenance on `Transaction`:** `origin`, `rawSms`, `smsHash`,
   `smsConfidence`, `needsReview`, plus `@@unique([householdId, smsHash])`.
5. Indexes: `@@index([householdId, revision])` on every syncable model.
6. Switch new-row ids to UUIDv7 (existing `cuid()` rows are untouched — the
   column is already `String`).
7. Seed practical sub-category trees for en and fa.

**Exit criteria**
- Migration applies cleanly to a **restored copy of the production dump** —
  not just to a fresh dev database.
- Backfill sets `revision` from `Household.syncRevision` for all existing rows.
- The deployed app runs unchanged against the new schema (all columns are
  nullable or defaulted).
- **A verified backup is taken before this deploys.** `deploy/restore.sh` is
  rehearsed, not assumed.

---

## Phase 4 — `apps/api` (NestJS) 🔒
*Branch: `feat/api-service`*

The transport mobile talks to. Controllers stay thin; all rules come from
`packages/core`.

- Bootstrap NestJS with Prisma from `packages/db`.
- **Auth:** `POST /auth/login | /register | /refresh | /logout`, access JWT
  (15 min) + rotating opaque refresh token (60 d) with reuse detection.
- **`HouseholdGuard`** resolving `{userId, householdId, role}` through
  `packages/core/access` — the identical policy the web app enforces.
- CRUD: accounts, categories, transactions, budgets, investments, recurring.
- OpenAPI spec → generates `packages/api-client`.
- Rate limiting on auth; structured request logging.
- Compose entry + Dockerfile; published to GHCR alongside web.

**Exit criteria**
- 🔒 **Isolation suite green:** a member of household A cannot read or write
  household B's rows through *any* endpoint, including with a forged
  `householdId` in the request body. Every role gate (VIEWER/MEMBER/ADMIN/OWNER)
  is asserted.
- Refresh-token reuse revokes the whole family (tested).
- OpenAPI generates a client that typechecks.
- Deployed alongside web; measured RSS fits the box (D5).

---

## Phase 5 — Encryption at the application layer 🔒 ⚠️
*Branch: `feat/field-encryption`*

Implements the Tier 1–3 boundary from D3.

- `packages/core/crypto`: envelope encryption — a per-household DEK wrapped by
  a master KEK (`TOKEN_ENCRYPTION_KEY`), generalizing today's `src/lib/crypto.ts`.
- Prisma middleware transparently encrypts/decrypts `Transaction.description`,
  `.notes`, `.rawSms` and the Plaid access token.
- `pnpm key:rotate` — re-wraps DEKs under a new KEK without touching row data.
- Backfill script encrypting existing plaintext rows.
- Document the volume-level and backup encryption steps in `docs/`.

**Exit criteria**
- Round-trip tests; a raw `SELECT` shows ciphertext for the covered columns.
- Reports, budgets and CSV export are unaffected (amounts and dates were never
  encrypted — that is the whole point of D3).
- Key rotation tested end to end on a database copy.
- **Explicitly documented:** losing `TOKEN_ENCRYPTION_KEY` means losing those
  fields permanently. The key goes in the backup runbook.

---

## Phase 6 — Sync protocol, server side 🔒
*Branch: `feat/sync-protocol`*

- `GET /sync/changes?householdId&since&limit` — revision-ordered, cursored.
- `POST /sync/push` — batched, transactional, idempotent by `opId`.
- Revision assignment inside the write transaction; conflict detection against
  `baseRevision`; losing payloads recorded in `SyncConflict`.
- `GET /sync/conflicts` + `POST /sync/conflicts/:id/resolve`.
- Tombstone propagation and a hard-delete sweep for tombstones every device
  has passed.
- FK-dependency ordering for batches (`account → category → transaction → budget`).

**Exit criteria**
- Scripted two-device simulation converges: both devices offline, both edit,
  both reconnect → identical state, loser preserved, no duplicates.
- Replaying an entire push batch changes nothing (idempotency).
- Delete beats concurrent edit (tested).
- A pull of 10k changes stays a single index range scan — verified with
  `EXPLAIN ANALYZE`, not assumed.

---

## Phase 7 — `packages/client-core` (the offline engine)
*Branch: `feat/client-core`*

Platform-agnostic and fully testable **before** any mobile UI exists — the
riskiest logic in the project should not be debugged through a simulator.

- `LocalStore` interface + local schema (mirror + `outbox` + `sync_meta`).
- Adapters: `expo-sqlite` (SQLCipher) and IndexedDB.
- Durable outbox: FIFO per household, dependency-ordered, backoff with jitter,
  single-op quarantine so one poisoned row never freezes the queue.
- Sync engine: pull loop, push loop, cursor persistence, reconnect triggers.
- React Query integration: local-first reads, optimistic writes, invalidation.

**Exit criteria**
- Full suite against an in-memory adapter — no device needed.
- Simulated flaky network (timeouts, duplicates, out-of-order) still converges.
- Documented invariant: **a pending outbox entry always wins over an incoming
  pull for the same row**, until it is pushed.
- 401 mid-sync preserves the outbox (never drop a user's unsent writes).

---

## Phase 8 — `apps/mobile` — Expo, iOS first
*Branch: `feat/mobile-ios`*

- Expo + expo-router + NativeWind; EAS profiles.
- Login / register against the API; refresh token in `expo-secure-store`.
- Screens: dashboard, transaction list, add/edit transaction, accounts,
  budgets, settings.
- Wired to `packages/client-core` — **every screen reads local, writes local**.
- Full en/fa with RTL via `I18nManager` (with the restart prompt the reload
  requirement forces), Jalali dates from `packages/core/calendar`.
- Offline indicator + pending-sync badge.

**Exit criteria**
- Maestro flow: login → add transaction → **airplane mode** → add two more →
  reconnect → all three on the web app.
- Cold launch to an interactive dashboard with **no network at all**.
- RTL verified on a physical device (simulators lie about RTL).
- TestFlight build installs and runs.

---

## Phase 9 — SMS parsing engine + Smart Paste *(parallelizable with 8)*
*Branch: `feat/sms-parser`*

- `packages/sms`: normalizer (Persian/Arabic digits, `٬` separators, ZWNJ),
  template registry, `parse()`, `toDraft()`, confidence scoring.
- Template packs for Melli, Mellat, Saderat, Saman, Pasargad, Tejarat, Blu,
  Ayandeh + generic CAD/USD alert formats.
- Redacted fixture corpus with snapshot tests.
- **Smart Paste UI** on web and mobile: paste → parsed preview → confirm.
- `needsReview` queue for low-confidence parses.
- Dedup by `smsHash`.

**Exit criteria**
- ≥ 95% correct extraction of amount, direction and date across the fixture
  corpus; each bank has fixtures in both digit systems.
- **Toman/rial ambiguity handled explicitly** — a 10× error is a serious bug
  in this app, not a rounding issue.
- Pasting the same SMS twice creates one transaction.
- Zero network calls in the default path.

---

## Phase 10 — Android: SMS auto-ingest + share target
*Branch: `feat/android-sms`*

Depends on your D4 answer.

- Android app parity + Play/APK build pipeline.
- **Share-sheet target** (no restricted permissions) — always shipped.
- **Auto-ingest** behind a build flag, if the distribution channel allows:
  runtime permission with an in-context explanation, a background reader
  filtering to known bank senders, drafts into the review queue.

**Exit criteria**
- Share target works from the stock Messages app.
- Denying the SMS permission degrades to Smart Paste with no dead ends.
- Auto-ingested transactions **always** land in the review queue first — the
  app never posts money the user did not see.
- The permission rationale screen states plainly what is read and where it goes.

---

## Phase 11 — Reporting v2 *(parallelizable)*
*Branch: `feat/reports-v2`*

- Chart specs move to `packages/core/reports` so web and mobile render the
  same numbers from one definition.
- Web: interactive drill-down (category → sub-category → transactions),
  period comparison, trends.
- Mobile: native charts (Skia/victory-native), computed from the local store
  so **reports work fully offline**.
- Net-worth over time, income vs. expense, budget burn-down, portfolio
  allocation.
- PDF/XLSX export (the outstanding item from the current backlog).

**Exit criteria** — web and mobile produce identical totals for the same range
in both calendars; every report renders offline on mobile.

---

## Phase 12 — Web PWA offline mode
*Branch: `feat/web-offline`*

Reuses the IndexedDB adapter from Phase 7: service worker, installable
manifest, offline shell. Client components move to React Query over
`client-core`; server components keep direct reads where SSR is the better fit.

**Exit criteria** — the web app loads and accepts transactions with the
network disabled in DevTools, then syncs on reconnect.

---

## Phase 13 — Security hardening and release readiness 🔒
*Branch: `feat/hardening`*

- Passkeys / TOTP 2FA; session and device management UI.
- Rate limiting and lockout on auth; audit log for household-level actions.
- Dependency audit (3 dependabot advisories are open on `main` today).
- Backup/restore rehearsal against the new schema, encryption keys included.
- Privacy policy and data-deletion flow (Play and App Store both require them).
- Threat-model review pass over the full data flow.

**Exit criteria** — automated security review clean; restore rehearsed from a
real backup; store privacy questionnaires answerable truthfully.

---

## Phase 14 — Store release
*Branch: `feat/release-v1`*

EAS build + submit, App Store and Play listings (en + fa), screenshots,
staged rollout, crash/error reporting, in-app update prompts.

---

## Ordering rationale

- **1–3 are foundational** and mostly mechanical. They carry deployment risk
  but almost no logic risk, so they go first while the app is simple.
- **4–7 build the spine** and can be fully tested headlessly. The sync engine
  is the highest-risk component in the project, which is exactly why it is
  proven with tests (Phase 7) *before* a mobile UI exists to hide bugs behind.
- **8–10 are the visible product.** Phase 9 is deliberately independent of
  Phase 8 so SMS parsing can proceed on the Mac Mini while mobile work
  continues on the Linux laptop.
- **11–14 are polish and release**, and can absorb schedule pressure without
  compromising correctness.

## Standing rules

1. **Never push without `pnpm typecheck && pnpm test && pnpm build` green.**
   CI builds the image the server runs; red CI means a silent stale deploy.
2. **Never suggest building on the VPS.** 1 vCPU / 961 MB — a Next.js build
   OOM-killed sshd there. CI builds, the server pulls.
3. **The household isolation test is permanent.** It must pass after every
   phase, on every transport.
4. **Money is never silently altered.** Conflicts are preserved, low-confidence
   parses are reviewed, deletes are tombstoned.
5. **Architectural changes get explained and approved before implementation.**
