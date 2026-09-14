-- AlterTable
ALTER TABLE "SupportThread" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SupportThread_archivedAt_idx" ON "SupportThread"("archivedAt");
