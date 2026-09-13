-- CreateEnum
CREATE TYPE "SupportThreadSource" AS ENUM ('TELEGRAM', 'WEB');

-- AlterTable: SupportThread — источник (Telegram-гость / веб-обращение сотрудника)
ALTER TABLE "SupportThread"
  ADD COLUMN     "source" "SupportThreadSource" NOT NULL DEFAULT 'TELEGRAM',
  ADD COLUMN     "employeeId" TEXT,
  ADD COLUMN     "topic" TEXT,
  ALTER COLUMN "telegramId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "SupportThread_employeeId_idx" ON "SupportThread"("employeeId");

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: обратная связь (Feedback) становится диалогами (SupportThread) —
-- один и тот же инбокс C&B для Telegram-гостей и веб-обращений сотрудников.
-- Таблица Feedback НЕ удаляется (историю не трогаем) — приложение просто
-- перестаёт её использовать.
INSERT INTO "SupportThread" ("id", "source", "employeeId", "topic", "status", "lastMessageAt", "createdAt")
SELECT
  "id",
  'WEB'::"SupportThreadSource",
  "employeeId",
  "topic",
  CASE WHEN "status" = 'CLOSED'::"FeedbackStatus" THEN 'CLOSED'::"SupportThreadStatus" ELSE 'OPEN'::"SupportThreadStatus" END,
  "createdAt",
  "createdAt"
FROM "Feedback";

-- Исходное сообщение сотрудника
INSERT INTO "SupportMessage" ("id", "threadId", "direction", "body", "readAt", "createdAt")
SELECT
  "id" || '-in',
  "id",
  'IN'::"SupportMessageDirection",
  "message",
  CASE WHEN "status" != 'NEW'::"FeedbackStatus" THEN "createdAt" ELSE NULL END,
  "createdAt"
FROM "Feedback";

-- Ответ C&B (если был)
INSERT INTO "SupportMessage" ("id", "threadId", "direction", "body", "authorId", "createdAt")
SELECT
  "id" || '-out',
  "id",
  'OUT'::"SupportMessageDirection",
  "adminNote",
  "handledById",
  COALESCE("handledAt", "createdAt")
FROM "Feedback"
WHERE "adminNote" IS NOT NULL;
