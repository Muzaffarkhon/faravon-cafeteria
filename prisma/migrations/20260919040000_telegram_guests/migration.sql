-- Гости бота: кто нажал «Старт». Идемпотентно.
CREATE TABLE IF NOT EXISTS "TelegramGuest" (
  "telegramId"   TEXT NOT NULL,
  "firstStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStartAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedAt"    TIMESTAMP(3),
  CONSTRAINT "TelegramGuest_pkey" PRIMARY KEY ("telegramId")
);

-- Восстанавливаем то, что известно из истории: кто пытался привязаться и кто писал в поддержку.
INSERT INTO "TelegramGuest" ("telegramId", "firstStartAt", "lastStartAt")
SELECT "telegramId", MIN("createdAt"), MAX("createdAt") FROM "TelegramAuthAttempt" GROUP BY "telegramId"
ON CONFLICT ("telegramId") DO NOTHING;

INSERT INTO "TelegramGuest" ("telegramId")
SELECT "telegramId" FROM "SupportThread" WHERE "telegramId" IS NOT NULL
ON CONFLICT ("telegramId") DO NOTHING;

-- Защита в глубину: закрываем прямой доступ через REST Supabase.
ALTER TABLE "TelegramGuest" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "TelegramGuest" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "TelegramGuest" FROM authenticated;
  END IF;
END $$;
