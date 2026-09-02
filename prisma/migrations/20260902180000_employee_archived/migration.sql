-- AlterTable: архив сотрудников (скрытие из основного списка без потери истории)
ALTER TABLE "Employee" ADD COLUMN     "archivedAt" TIMESTAMP(3);

CREATE INDEX "Employee_archivedAt_idx" ON "Employee"("archivedAt");
