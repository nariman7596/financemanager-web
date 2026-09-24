-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "heldForId" TEXT;

-- CreateTable
CREATE TABLE "MarketQuote" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketQuote_symbol_source_key" ON "MarketQuote"("symbol", "source");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_heldForId_fkey" FOREIGN KEY ("heldForId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

