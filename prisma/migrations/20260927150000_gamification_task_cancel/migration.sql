-- Отмена задачи геймификации сотрудником (§ cancelTask в gamification-tasks.ts).

ALTER TYPE "EmployeeTaskStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "EmployeeTask"
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledPeriodId" TEXT;
