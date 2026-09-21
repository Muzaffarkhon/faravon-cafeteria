-- AlterTable
ALTER TABLE "SupportThread" ADD COLUMN     "regCandidateEmployeeId" TEXT,
ADD COLUMN     "regPhoneAttempts" INTEGER NOT NULL DEFAULT 0;
