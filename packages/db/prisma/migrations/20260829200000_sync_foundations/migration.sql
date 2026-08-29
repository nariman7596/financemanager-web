-- Phase 3: sub-categories, the per-row sync envelope, and the sync/device/key
-- tables. See ARCHITECTURE.md §3 and §4.
--
-- Everything added here is nullable or defaulted, so the currently deployed
-- application keeps working against this schema untouched. Nothing reads the
-- new columns until Phase 4 (API) and Phase 6 (sync protocol).

-- DropIndex
DROP INDEX "Category_householdId_name_type_key";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastWriterDeviceId" TEXT,
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastWriterDeviceId" TEXT,
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastWriterDeviceId" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "seedKey" TEXT;

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "syncRevision" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastWriterDeviceId" TEXT,
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastWriterDeviceId" TEXT,
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastWriterDeviceId" TEXT,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "rawSms" TEXT,
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "smsConfidence" DOUBLE PRECISION,
ADD COLUMN     "smsHash" TEXT;

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT,
    "pushToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "deviceId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "lastRevision" BIGINT NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("deviceId","householdId")
);

-- CreateTable
CREATE TABLE "SyncOperation" (
    "opId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "appliedRevision" BIGINT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("opId")
);

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "losingPayload" JSONB NOT NULL,
    "winningRevision" BIGINT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdKey" (
    "householdId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdKey_pkey" PRIMARY KEY ("householdId")
);

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "SyncOperation_householdId_appliedAt_idx" ON "SyncOperation"("householdId", "appliedAt");

-- CreateIndex
CREATE INDEX "SyncConflict_householdId_resolvedAt_idx" ON "SyncConflict"("householdId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_familyId_idx" ON "RefreshToken"("userId", "familyId");

-- CreateIndex
CREATE INDEX "Account_householdId_revision_idx" ON "Account"("householdId", "revision");

-- CreateIndex
CREATE INDEX "Budget_householdId_revision_idx" ON "Budget"("householdId", "revision");

-- CreateIndex
CREATE INDEX "Category_householdId_parentId_idx" ON "Category"("householdId", "parentId");

-- CreateIndex
CREATE INDEX "Category_householdId_revision_idx" ON "Category"("householdId", "revision");

-- CreateIndex
CREATE INDEX "Investment_householdId_revision_idx" ON "Investment"("householdId", "revision");

-- CreateIndex
CREATE INDEX "RecurringTransaction_householdId_revision_idx" ON "RecurringTransaction"("householdId", "revision");

-- CreateIndex
CREATE INDEX "Transaction_householdId_revision_idx" ON "Transaction"("householdId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_householdId_smsHash_key" ON "Transaction"("householdId", "smsHash");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncConflict" ADD CONSTRAINT "SyncConflict_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdKey" ADD CONSTRAINT "HouseholdKey_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Category uniqueness: two PARTIAL indexes, not one plain unique index.
--
-- The obvious replacement for the dropped Category_householdId_name_type_key
-- would be UNIQUE (householdId, parentId, name, type). That silently does NOT
-- work: Postgres treats NULLs as distinct in a unique index, so two top-level
-- categories (parentId IS NULL) with the same name both insert happily, and
-- the household ends up with duplicate "Groceries" splitting its reports in
-- two. Verified against a real Postgres before choosing this shape.
--
-- Postgres 15+ could express this as UNIQUE NULLS NOT DISTINCT, but Prisma
-- cannot emit that, and partial indexes work on every version.
-- ---------------------------------------------------------------------------

-- Siblings under the same parent must not collide.
CREATE UNIQUE INDEX "Category_sibling_name_key"
  ON "Category" ("householdId", "parentId", name, type)
  WHERE "parentId" IS NOT NULL;

-- Top-level categories must not collide either -- the case a plain index misses.
CREATE UNIQUE INDEX "Category_root_name_key"
  ON "Category" ("householdId", name, type)
  WHERE "parentId" IS NULL;

-- ---------------------------------------------------------------------------
-- Backfill 1: seedKey on categories that still carry a seeded name.
--
-- relabelDefaults currently identifies seeded rows by matching the localised
-- NAME, which breaks as soon as somebody renames a category to text that
-- collides with the other locale's seed. This is the one and only time that
-- name matching is used: from here on the key is authoritative. A row the user
-- renamed matches nothing and correctly keeps seedKey NULL, which is exactly
-- what "leave the user's own categories alone" means.
-- ---------------------------------------------------------------------------
UPDATE "Category" SET "seedKey" = v.key
FROM (VALUES
  ('salary','Salary','حقوق','INCOME'),
  ('business','Business','کسب‌وکار','INCOME'),
  ('investments','Investments','سرمایه‌گذاری','INCOME'),
  ('other_income','Other Income','درآمد متفرقه','INCOME'),
  ('housing','Housing','مسکن','EXPENSE'),
  ('groceries','Groceries','خواربار','EXPENSE'),
  ('transport','Transport','حمل‌ونقل','EXPENSE'),
  ('utilities','Utilities','قبوض','EXPENSE'),
  ('dining','Dining','رستوران','EXPENSE'),
  ('health','Health','سلامت و درمان','EXPENSE'),
  ('entertainment','Entertainment','سرگرمی','EXPENSE'),
  ('shopping','Shopping','خرید','EXPENSE'),
  ('other','Other','متفرقه','EXPENSE')
) AS v(key, en, fa, type)
WHERE "Category".type = v.type
  AND ("Category".name = v.en OR "Category".name = v.fa);

-- ---------------------------------------------------------------------------
-- Backfill 2: give every existing row a revision, per household.
--
-- Rows are numbered 1..N in creation order across ALL syncable tables of a
-- household, and Household.syncRevision is set to N. Distinct revisions (rather
-- than stamping everything with 1) mean a device can page through the initial
-- snapshot with a simple `revision > cursor` and never have a page boundary
-- fall in the middle of a tie.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _rev_backfill AS
SELECT tbl, id, "householdId",
       row_number() OVER (PARTITION BY "householdId" ORDER BY "createdAt", id) AS rev
FROM (
  SELECT 'Account'              AS tbl, id, "householdId", "createdAt" FROM "Account"
  UNION ALL SELECT 'Category',              id, "householdId", "createdAt" FROM "Category"
  UNION ALL SELECT 'Transaction',           id, "householdId", "createdAt" FROM "Transaction"
  UNION ALL SELECT 'Budget',                id, "householdId", "createdAt" FROM "Budget"
  UNION ALL SELECT 'Investment',            id, "householdId", "createdAt" FROM "Investment"
  UNION ALL SELECT 'RecurringTransaction',  id, "householdId", "createdAt" FROM "RecurringTransaction"
) AS all_rows;

UPDATE "Account" t              SET revision = b.rev FROM _rev_backfill b WHERE b.tbl = 'Account'              AND b.id = t.id;
UPDATE "Category" t             SET revision = b.rev FROM _rev_backfill b WHERE b.tbl = 'Category'             AND b.id = t.id;
UPDATE "Transaction" t          SET revision = b.rev FROM _rev_backfill b WHERE b.tbl = 'Transaction'          AND b.id = t.id;
UPDATE "Budget" t               SET revision = b.rev FROM _rev_backfill b WHERE b.tbl = 'Budget'               AND b.id = t.id;
UPDATE "Investment" t           SET revision = b.rev FROM _rev_backfill b WHERE b.tbl = 'Investment'           AND b.id = t.id;
UPDATE "RecurringTransaction" t SET revision = b.rev FROM _rev_backfill b WHERE b.tbl = 'RecurringTransaction' AND b.id = t.id;

UPDATE "Household" h
SET "syncRevision" = COALESCE((SELECT MAX(rev) FROM _rev_backfill b WHERE b."householdId" = h.id), 0);

DROP TABLE _rev_backfill;

-- Existing rows all came from the web app.
UPDATE "Transaction" SET origin = 'RECURRING' WHERE "recurringId" IS NOT NULL;
UPDATE "Transaction" SET origin = 'PLAID'     WHERE "plaidTransactionId" IS NOT NULL;
