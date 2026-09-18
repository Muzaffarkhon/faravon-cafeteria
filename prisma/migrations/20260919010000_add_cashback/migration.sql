-- Режимы льгот и кешбек. Скрипт идемпотентен: его можно применить вручную (SQL Editor),
-- а затем `prisma migrate deploy` на деплое пройдёт без ошибок.

DO $$ BEGIN
  CREATE TYPE "BenefitMode" AS ENUM ('ONE_TIME', 'PERIOD', 'CASHBACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CashbackKind" AS ENUM ('ACCRUAL', 'REDEMPTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "BenefitCard"
  ADD COLUMN IF NOT EXISTS "cashbackPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mode" "BenefitMode" NOT NULL DEFAULT 'ONE_TIME';

ALTER TABLE "BenefitCardVersion"
  ADD COLUMN IF NOT EXISTS "cashbackPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mode" "BenefitMode" NOT NULL DEFAULT 'ONE_TIME';

CREATE TABLE IF NOT EXISTS "CashbackAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CashbackEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "CashbackKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "purchaseAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL,
    "couponId" TEXT,
    "actorId" TEXT,
    "opKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashbackEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CashbackAccount_partnerId_idx" ON "CashbackAccount"("partnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "CashbackAccount_employeeId_partnerId_key" ON "CashbackAccount"("employeeId", "partnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "CashbackEntry_opKey_key" ON "CashbackEntry"("opKey");
CREATE INDEX IF NOT EXISTS "CashbackEntry_accountId_createdAt_idx" ON "CashbackEntry"("accountId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CashbackAccount" ADD CONSTRAINT "CashbackAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CashbackAccount" ADD CONSTRAINT "CashbackAccount_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CashbackEntry" ADD CONSTRAINT "CashbackEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashbackAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Баланс кешбека не может стать отрицательным (защита от гонок на уровне БД)
DO $$ BEGIN
  ALTER TABLE "CashbackAccount" ADD CONSTRAINT "CashbackAccount_balance_nonneg" CHECK ("balance" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
