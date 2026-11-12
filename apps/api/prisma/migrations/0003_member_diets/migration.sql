-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "diets" TEXT[] DEFAULT ARRAY[]::TEXT[];

