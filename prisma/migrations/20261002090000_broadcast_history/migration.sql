-- История всех рассылок, отложенная отправка и статус доставки (src/lib/broadcast-send.ts).
-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- AlterTable
ALTER TABLE "BroadcastCampaign" ADD COLUMN     "askConfirm" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "couponHint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "filters" JSONB,
ADD COLUMN     "guestFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guestSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "segment" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "status" "BroadcastStatus" NOT NULL DEFAULT 'SENT',
ADD COLUMN     "texts" JSONB;

-- AlterTable
ALTER TABLE "BroadcastRecipient" ADD COLUMN     "notificationId" TEXT;

-- CreateIndex
CREATE INDEX "BroadcastCampaign_status_scheduledAt_idx" ON "BroadcastCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_notificationId_key" ON "BroadcastRecipient"("notificationId");

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: до этой миграции сохранялись только рассылки с подтверждением.
UPDATE "BroadcastCampaign" SET "sentAt" = "createdAt" WHERE "sentAt" IS NULL;
UPDATE "BroadcastCampaign" SET "segment" = 'BY_CARD' WHERE "segment" IS NULL AND "cardId" IS NOT NULL;

-- Backfill: связать прошлых получателей с их уведомлениями (payload.confirmId) — появится статус доставки.
UPDATE "BroadcastRecipient" r
SET "notificationId" = n."id"
FROM "Notification" n
WHERE r."notificationId" IS NULL
  AND n."event" = 'BROADCAST'
  AND n."payload"->>'confirmId' = r."id";
