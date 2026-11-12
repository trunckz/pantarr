-- Shopping list and aisles kept by Pantarr (they were in Mealie: copied at the first use of each household)
CREATE TABLE "ShoppingItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "aisle" TEXT NOT NULL DEFAULT '',
    "area" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "extras" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShoppingItem_householdId_checked_idx" ON "ShoppingItem"("householdId", "checked");
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Aisle" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Aisle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Aisle_householdId_name_key" ON "Aisle"("householdId", "name");
ALTER TABLE "Aisle" ADD CONSTRAINT "Aisle_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
