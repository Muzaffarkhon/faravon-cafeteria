-- AlterTable
ALTER TABLE "ApplicationItem" ADD COLUMN     "viaCoins" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Period" ADD COLUMN     "maxCoinRedemptions" INTEGER NOT NULL DEFAULT 1;

