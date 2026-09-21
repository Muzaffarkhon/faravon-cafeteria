-- Переводы шаблонов уведомлений (tg/uz), редактируемые в админке. Идемпотентно.
ALTER TABLE "NotificationTemplate" ADD COLUMN IF NOT EXISTS "translations" JSONB;
