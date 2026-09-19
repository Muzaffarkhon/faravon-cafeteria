-- Усиление кешбека: сторно, идемпотентность, снимок правил в купоне, защита журнала.
-- Идемпотентно: можно применить вручную (SQL Editor), затем деплой пройдёт без ошибок.

ALTER TYPE "CashbackKind" ADD VALUE IF NOT EXISTS 'ACCRUAL_REVERSAL';
ALTER TYPE "CashbackKind" ADD VALUE IF NOT EXISTS 'REDEMPTION_REVERSAL';

ALTER TABLE "Coupon"
  ADD COLUMN IF NOT EXISTS "benefitMode" "BenefitMode" NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN IF NOT EXISTS "cashbackPercent" INTEGER;

ALTER TABLE "CashbackAccount" ADD COLUMN IF NOT EXISTS "lastCodeWindow" INTEGER;

ALTER TABLE "CashbackEntry"
  ADD COLUMN IF NOT EXISTS "operationKey" TEXT,
  ADD COLUMN IF NOT EXISTS "paramsHash" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "reversesEntryId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CashbackEntry_reversesEntryId_key" ON "CashbackEntry"("reversesEntryId");
CREATE INDEX IF NOT EXISTS "CashbackEntry_operationKey_idx" ON "CashbackEntry"("operationKey");

-- Снимок правил для уже выданных купонов карточек с нестандартным режимом.
UPDATE "Coupon" c
SET "benefitMode" = bc."mode",
    "cashbackPercent" = CASE WHEN bc."mode" = 'CASHBACK' THEN bc."cashbackPercent" END
FROM "ApplicationItem" ai
JOIN "BenefitCard" bc ON bc."id" = ai."cardId"
WHERE ai."id" = c."itemId" AND c."benefitMode" = 'ONE_TIME' AND bc."mode" <> 'ONE_TIME';

-- Журнал операций неизменяем: только добавление. Исправления — записью-сторно.
CREATE OR REPLACE FUNCTION cashback_entry_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CashbackEntry is append-only (use a reversal entry)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cashback_entry_no_update_delete ON "CashbackEntry";
CREATE TRIGGER cashback_entry_no_update_delete
  BEFORE UPDATE OR DELETE ON "CashbackEntry"
  FOR EACH ROW EXECUTE FUNCTION cashback_entry_append_only();

-- Защита в глубину: закрываем прямой доступ через REST Supabase (приложение ходит через Prisma
-- под владельцем таблиц, RLS его не касается).
ALTER TABLE "CashbackAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashbackEntry" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "CashbackAccount", "CashbackEntry" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "CashbackAccount", "CashbackEntry" FROM authenticated;
  END IF;
END $$;
