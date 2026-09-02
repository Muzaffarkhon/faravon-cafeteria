-- AlterTable: архив карточек льгот
ALTER TABLE "BenefitCard" ADD COLUMN     "archivedAt" TIMESTAMP(3);

CREATE INDEX "BenefitCard_archivedAt_idx" ON "BenefitCard"("archivedAt");
