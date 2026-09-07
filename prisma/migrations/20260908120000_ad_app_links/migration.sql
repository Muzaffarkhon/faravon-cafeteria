-- Заявка на рекламу: убрана «Бюджет», добавлены ссылки на приложение
-- (Android / iOS) — они же переносятся в баннер при одобрении.

-- AlterTable
ALTER TABLE "AdvertisingRequest" DROP COLUMN "budget";
ALTER TABLE "AdvertisingRequest" ADD COLUMN "androidUrl" TEXT;
ALTER TABLE "AdvertisingRequest" ADD COLUMN "iosUrl" TEXT;

-- AlterTable
ALTER TABLE "PartnerBanner" ADD COLUMN "androidUrl" TEXT;
ALTER TABLE "PartnerBanner" ADD COLUMN "iosUrl" TEXT;
