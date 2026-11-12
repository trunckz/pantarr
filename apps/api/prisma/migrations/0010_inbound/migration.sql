-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "inboundCode" TEXT,
ADD COLUMN     "inboundConfirm" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Household_inboundCode_key" ON "Household"("inboundCode");
