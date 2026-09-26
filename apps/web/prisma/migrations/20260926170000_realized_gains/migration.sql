-- CreateTable
CREATE TABLE "RealizedGain" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "proceeds" DECIMAL(65,30) NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealizedGain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RealizedGain_householdId_soldAt_idx" ON "RealizedGain"("householdId", "soldAt");

-- AddForeignKey
ALTER TABLE "RealizedGain" ADD CONSTRAINT "RealizedGain_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
