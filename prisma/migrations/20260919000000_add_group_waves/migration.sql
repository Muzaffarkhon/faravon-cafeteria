-- AlterTable
ALTER TABLE "BenefitCard" ADD COLUMN IF NOT EXISTS "groupWaves" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BenefitCardVersion" ADD COLUMN IF NOT EXISTS "groupWaves" BOOLEAN NOT NULL DEFAULT false;
