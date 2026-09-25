-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "allocationTargets" JSONB;

-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "allocClass" TEXT;

-- AlterTable
ALTER TABLE "NetWorthSnapshot" ADD COLUMN     "classes" JSONB;

