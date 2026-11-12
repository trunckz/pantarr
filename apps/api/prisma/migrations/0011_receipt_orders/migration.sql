-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "orderKey" TEXT,
ADD COLUMN     "orderRank" INTEGER;

-- CreateIndex
CREATE INDEX "Receipt_householdId_orderKey_idx" ON "Receipt"("householdId", "orderKey");
