-- AlterTable
ALTER TABLE "BenefitCard" ADD COLUMN "minParticipants" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "BenefitCardVersion" ADD COLUMN "minParticipants" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationItem_applicationId_cardId_key" ON "ApplicationItem"("applicationId", "cardId");

-- CreateIndex
CREATE INDEX "ApplicationItem_cardId_idx" ON "ApplicationItem"("cardId");
