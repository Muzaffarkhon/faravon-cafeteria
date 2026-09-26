-- CreateEnum
CREATE TYPE "TaskScope" AS ENUM ('ALL', 'DEPARTMENT', 'SPECIFIC');

-- CreateEnum
CREATE TYPE "GamificationVerification" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "GamificationAutoMetric" AS ENUM ('APPLICATIONS_SUBMITTED', 'COUPONS_USED', 'FEEDBACK_GIVEN');

-- CreateEnum
CREATE TYPE "EmployeeTaskStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CoinEntryKind" AS ENUM ('EARNED', 'SPENT', 'REVERSED');

-- CreateEnum
CREATE TYPE "CoinRedemptionMode" AS ENUM ('INSTANT', 'REQUEST');

-- CreateEnum
CREATE TYPE "CoinRedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED');

-- AlterTable
ALTER TABLE "BenefitCard" ADD COLUMN     "coinPrice" INTEGER,
ADD COLUMN     "coinRedemptionMode" "CoinRedemptionMode";

-- CreateTable
CREATE TABLE "GamificationTask" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coinReward" INTEGER NOT NULL,
    "verification" "GamificationVerification" NOT NULL,
    "autoMetric" "GamificationAutoMetric",
    "targetValue" INTEGER,
    "scope" "TaskScope" NOT NULL DEFAULT 'ALL',
    "department" TEXT,
    "employeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamificationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTask" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "EmployeeTaskStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "progressValue" INTEGER NOT NULL DEFAULT 0,
    "prizeCardId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "EmployeeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "CoinEntryKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "taskId" TEXT,
    "redemptionId" TEXT,
    "opKey" TEXT NOT NULL,
    "reversesEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinRedemption" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitCardId" TEXT NOT NULL,
    "coinCost" INTEGER NOT NULL,
    "mode" "CoinRedemptionMode" NOT NULL,
    "status" "CoinRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "couponId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamificationTask_seq_key" ON "GamificationTask"("seq");

-- CreateIndex
CREATE INDEX "GamificationTask_isActive_startsAt_idx" ON "GamificationTask"("isActive", "startsAt");

-- CreateIndex
CREATE INDEX "EmployeeTask_status_idx" ON "EmployeeTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTask_employeeId_taskId_key" ON "EmployeeTask"("employeeId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinAccount_employeeId_key" ON "CoinAccount"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinEntry_opKey_key" ON "CoinEntry"("opKey");

-- CreateIndex
CREATE UNIQUE INDEX "CoinEntry_reversesEntryId_key" ON "CoinEntry"("reversesEntryId");

-- CreateIndex
CREATE INDEX "CoinEntry_accountId_createdAt_idx" ON "CoinEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "CoinRedemption_employeeId_idx" ON "CoinRedemption"("employeeId");

-- CreateIndex
CREATE INDEX "CoinRedemption_status_idx" ON "CoinRedemption"("status");

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GamificationTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinAccount" ADD CONSTRAINT "CoinAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinEntry" ADD CONSTRAINT "CoinEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CoinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinRedemption" ADD CONSTRAINT "CoinRedemption_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinRedemption" ADD CONSTRAINT "CoinRedemption_benefitCardId_fkey" FOREIGN KEY ("benefitCardId") REFERENCES "BenefitCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
