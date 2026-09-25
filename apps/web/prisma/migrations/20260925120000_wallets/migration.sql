-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "walletAsset" TEXT,
ADD COLUMN     "walletId" TEXT;

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "addresses" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "errors" JSONB,
    "stakePools" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wallet_householdId_idx" ON "Wallet"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_walletId_walletAsset_key" ON "Investment"("walletId", "walletAsset");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

