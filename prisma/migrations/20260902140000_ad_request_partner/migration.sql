-- AlterTable: заявку на рекламу подаёт партнёр
ALTER TABLE "AdvertisingRequest" ADD COLUMN     "partnerId" TEXT;

-- CreateIndex
CREATE INDEX "AdvertisingRequest_partnerId_idx" ON "AdvertisingRequest"("partnerId");

-- AddForeignKey
ALTER TABLE "AdvertisingRequest" ADD CONSTRAINT "AdvertisingRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
