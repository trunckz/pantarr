-- Sessions that can be ended: version carried by the session tokens (revue S7)
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
