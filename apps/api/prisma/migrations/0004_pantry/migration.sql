-- AlterTable
ALTER TABLE "PantryFamily" ADD COLUMN     "lastSeen" DATE,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "predicted" DATE;

