-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "billingCustomer" TEXT,
ADD COLUMN     "billingProvider" TEXT,
ADD COLUMN     "billingSubscription" TEXT,
ADD COLUMN     "mealieGroupId" TEXT,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "planRenewsAt" TIMESTAMP(3),
ADD COLUMN     "planStatus" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member';

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "householdId" TEXT,
    "role" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_hash_key" ON "EmailToken"("hash");


-- Existing accounts are trusted (created by an administrator or before the hosted mode)
UPDATE "User" SET "emailVerifiedAt" = "createdAt";
