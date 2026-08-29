-- Widen the sync indexes from (householdId, revision) to
-- (householdId, revision, id).
--
-- The pull cursor is (revision, id) — the id tiebreak exists because rows
-- seeded with a household all share one revision, and a cursor on revision
-- alone lets a page boundary fall inside that group. With only the two-column
-- index, Postgres answers the paging query with a bitmap scan and a full sort;
-- with the id included it is a plain ordered Index Scan and no sort at all.
--
-- Measured on 20k transactions (10k in the household, 10k in a neighbour):
--   before: Bitmap Heap Scan + Sort, 1.24 ms, 32 buffers
--   after:  Index Scan, no sort,     0.32 ms, 12 buffers
--
-- The three-column index has the two-column one as a prefix, so this replaces
-- rather than adds — no extra write cost.

-- DropIndex
DROP INDEX "Account_householdId_revision_idx";

-- DropIndex
DROP INDEX "Budget_householdId_revision_idx";

-- DropIndex
DROP INDEX "Category_householdId_revision_idx";

-- DropIndex
DROP INDEX "Investment_householdId_revision_idx";

-- DropIndex
DROP INDEX "RecurringTransaction_householdId_revision_idx";

-- DropIndex
DROP INDEX "Transaction_householdId_revision_idx";

-- CreateIndex
CREATE INDEX "Account_householdId_revision_id_idx" ON "Account"("householdId", "revision", "id");

-- CreateIndex
CREATE INDEX "Budget_householdId_revision_id_idx" ON "Budget"("householdId", "revision", "id");

-- CreateIndex
CREATE INDEX "Category_householdId_revision_id_idx" ON "Category"("householdId", "revision", "id");

-- CreateIndex
CREATE INDEX "Investment_householdId_revision_id_idx" ON "Investment"("householdId", "revision", "id");

-- CreateIndex
CREATE INDEX "RecurringTransaction_householdId_revision_id_idx" ON "RecurringTransaction"("householdId", "revision", "id");

-- CreateIndex
CREATE INDEX "Transaction_householdId_revision_id_idx" ON "Transaction"("householdId", "revision", "id");

