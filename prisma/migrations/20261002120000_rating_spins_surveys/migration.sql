-- Бонусные прокрутки за оценку, опрос после выдачи купона/промокода, опросы за монеты.
-- CreateEnum
CREATE TYPE "SurveyQuestionKind" AS ENUM ('SINGLE', 'MULTI', 'TEXT');

-- AlterTable
ALTER TABLE "SatisfactionSettings" ADD COLUMN     "afterIssueDays" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "GamificationSettings" ADD COLUMN     "wheelSpinsForRating" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "WheelSpin" ADD COLUMN     "bonus" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WheelBonusSpin" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "opKey" TEXT NOT NULL,
    "spinId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelBonusSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "kind" "SurveyQuestionKind" NOT NULL DEFAULT 'SINGLE',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WheelBonusSpin_opKey_key" ON "WheelBonusSpin"("opKey");

-- CreateIndex
CREATE UNIQUE INDEX "WheelBonusSpin_spinId_key" ON "WheelBonusSpin"("spinId");

-- CreateIndex
CREATE INDEX "WheelBonusSpin_employeeId_usedAt_idx" ON "WheelBonusSpin"("employeeId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Survey_seq_key" ON "Survey"("seq");

-- CreateIndex
CREATE INDEX "Survey_isActive_idx" ON "Survey"("isActive");

-- CreateIndex
CREATE INDEX "SurveyQuestion_surveyId_position_idx" ON "SurveyQuestion"("surveyId", "position");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_createdAt_idx" ON "SurveyResponse"("surveyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_surveyId_employeeId_key" ON "SurveyResponse"("surveyId", "employeeId");

-- AddForeignKey
ALTER TABLE "WheelBonusSpin" ADD CONSTRAINT "WheelBonusSpin_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelBonusSpin" ADD CONSTRAINT "WheelBonusSpin_spinId_fkey" FOREIGN KEY ("spinId") REFERENCES "WheelSpin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

