-- Колесо подарков (src/lib/wheel.ts): листки, прокрутки, настройки.
-- CreateEnum
CREATE TYPE "WheelPrizeKind" AS ENUM ('COUPON', 'COINS', 'NOTHING');

-- AlterTable
ALTER TABLE "ApplicationItem" ADD COLUMN     "viaWheel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GamificationSettings" ADD COLUMN     "wheelEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wheelSpinCost" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WheelSector" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "WheelPrizeKind" NOT NULL,
    "label" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "coins" INTEGER,
    "cardId" TEXT,
    "quantity" INTEGER,
    "wonCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WheelSector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelSpin" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "sectorId" TEXT,
    "kind" "WheelPrizeKind" NOT NULL,
    "prizeLabel" TEXT NOT NULL,
    "coins" INTEGER,
    "cardId" TEXT,
    "itemId" TEXT,
    "periodId" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelSpin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WheelSector_isActive_position_idx" ON "WheelSector"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WheelSpin_itemId_key" ON "WheelSpin"("itemId");

-- CreateIndex
CREATE INDEX "WheelSpin_createdAt_idx" ON "WheelSpin"("createdAt");

-- CreateIndex
CREATE INDEX "WheelSpin_sectorId_idx" ON "WheelSpin"("sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "WheelSpin_employeeId_dayKey_key" ON "WheelSpin"("employeeId", "dayKey");

-- AddForeignKey
ALTER TABLE "WheelSector" ADD CONSTRAINT "WheelSector_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BenefitCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "WheelSector"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Страховка поверх условного UPDATE в spinWheel: выигрышей не больше, чем купонов.
ALTER TABLE "WheelSector" ADD CONSTRAINT "WheelSector_wonCount_le_quantity" CHECK ("quantity" IS NULL OR "wonCount" <= "quantity");
