-- CreateTable
CREATE TABLE "TelegramAuthAttempt" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramAuthAttempt_telegramId_createdAt_idx" ON "TelegramAuthAttempt"("telegramId", "createdAt");
