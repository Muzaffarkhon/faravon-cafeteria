-- AlterTable: подрядчик привязан к партнёру (гасит только его купоны)
ALTER TABLE "User" ADD COLUMN     "partnerId" TEXT;

-- CreateIndex
CREATE INDEX "User_partnerId_idx" ON "User"("partnerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
