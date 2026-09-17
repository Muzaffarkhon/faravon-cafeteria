-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "replyToId" TEXT;

-- CreateIndex
CREATE INDEX "SupportMessage_replyToId_idx" ON "SupportMessage"("replyToId");

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "SupportMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
