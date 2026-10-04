-- Срезы отчётов: личные/общие + рассылка по расписанию.
ALTER TABLE "ReportPreset" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;

-- Уже сохранённые срезы были видны всем — оставляем их общими.
UPDATE "ReportPreset" SET "shared" = true;

CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportSchedule_presetId_userId_key" ON "ReportSchedule"("presetId", "userId");
CREATE INDEX "ReportSchedule_userId_idx" ON "ReportSchedule"("userId");

ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ReportPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
