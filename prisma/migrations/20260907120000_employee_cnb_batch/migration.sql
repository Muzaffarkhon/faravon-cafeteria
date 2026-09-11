-- Пакет правок кабинета сотрудника и C&B (2026-09):
--   • обратная связь (Feedback)
--   • способ выдачи льготы у партнёра (DeliveryMode) — режим PHONE_PROMO для такси
--   • тип баннера (BannerKind) — свои новости без пометки «Партнёр»
--   • телефон сотрудника, указанный при выборе PHONE_PROMO-льготы
--   • перенос непобравшейся групповой льготы в следующий период (carriedFromId)

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('QR', 'PHONE_PROMO');

-- CreateEnum
CREATE TYPE "BannerKind" AS ENUM ('PARTNER', 'NEWS');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'READ', 'NOTED', 'CLOSED');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'QR';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- AlterTable
ALTER TABLE "PartnerBanner" ADD COLUMN "kind" "BannerKind" NOT NULL DEFAULT 'PARTNER';

-- AlterTable
ALTER TABLE "ApplicationItem" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "ApplicationItem" ADD COLUMN "carriedFromId" TEXT;

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "topic" TEXT,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_employeeId_idx" ON "Feedback"("employeeId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationItem_carriedFromId_key" ON "ApplicationItem"("carriedFromId");

-- AddForeignKey
ALTER TABLE "ApplicationItem" ADD CONSTRAINT "ApplicationItem_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "ApplicationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
