-- AlterTable: принудительный выход со всех устройств (§5.1)
ALTER TABLE "User" ADD COLUMN     "sessionEpoch" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: пометки о разосланных оконных уведомлениях (§5.10)
ALTER TABLE "Period" ADD COLUMN     "windowOpenNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "windowClosingNotifiedAt" TIMESTAMP(3);

-- CreateTable: журнал попыток входа — лимит перебора по IP + история входов (§5.1)
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_login_createdAt_idx" ON "LoginAttempt"("login", "createdAt");
