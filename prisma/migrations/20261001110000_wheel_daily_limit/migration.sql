-- AlterTable
ALTER TABLE "GamificationSettings" ADD COLUMN "wheelDailyLimit" INTEGER NOT NULL DEFAULT 1;

-- DropIndex
DROP INDEX IF EXISTS "WheelSpin_employeeId_dayKey_key";

-- CreateIndex
CREATE INDEX "WheelSpin_employeeId_dayKey_idx" ON "WheelSpin"("employeeId", "dayKey");
