-- SMS import: bank messages forwarded from the phone become transactions.
--
-- Purely additive. Existing rows get origin 'MANUAL' and needsReview false,
-- which is exactly what they are; nothing is backfilled or rewritten.
--
--   Account.smsMatch        the number the account's bank prints in its SMS
--   Transaction.origin      MANUAL | SMS
--   Transaction.needsReview booked from an SMS, category not chosen yet
--   Transaction.bankBalance balance the bank reported, for reconciliation
--   SmsMessage              every forwarded message; (householdId, hash) makes
--                           re-delivery a no-op
--   ApiToken                device keys (SHA-256 only) for the iOS shortcut

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "smsMatch" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "bankBalance" DECIMAL(65,30),
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT,
    "body" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transactionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_transactionId_key" ON "SmsMessage"("transactionId");

-- CreateIndex
CREATE INDEX "SmsMessage_householdId_status_idx" ON "SmsMessage"("householdId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_householdId_hash_key" ON "SmsMessage"("householdId", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_householdId_idx" ON "ApiToken"("householdId");

-- CreateIndex
CREATE INDEX "Transaction_householdId_needsReview_idx" ON "Transaction"("householdId", "needsReview");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

