-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_deliveredAt_idx" ON "Notification"("deliveredAt");

