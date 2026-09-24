-- Additive only: a new table, nothing existing changes. "Always file this
-- description under that category" (or "as a transfer to that account"),
-- created from the Review page.
-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" TEXT NOT NULL,
    "match" TEXT NOT NULL,
    "categoryId" TEXT,
    "transferAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryRule_householdId_idx" ON "CategoryRule"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_householdId_type_match_key" ON "CategoryRule"("householdId", "type", "match");

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
