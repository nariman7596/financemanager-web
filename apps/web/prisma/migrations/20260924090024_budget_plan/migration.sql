-- Additive only: one nullable column for the budget planner's saved inputs.
-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "budgetPlan" JSONB;
