-- AlterTable
ALTER TABLE "BenefitCard" ADD COLUMN "groupWaves" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BenefitCardVersion" ADD COLUMN "groupWaves" BOOLEAN NOT NULL DEFAULT false;
