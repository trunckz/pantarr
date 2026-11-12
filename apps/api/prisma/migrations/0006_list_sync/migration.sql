-- CreateTable
CREATE TABLE "ListSyncLink" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "extChecked" BOOLEAN NOT NULL DEFAULT false,
    "itemChecked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ListSyncLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListSyncLink_householdId_moduleId_externalId_key" ON "ListSyncLink"("householdId", "moduleId", "externalId");

-- AddForeignKey
ALTER TABLE "ListSyncLink" ADD CONSTRAINT "ListSyncLink_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

