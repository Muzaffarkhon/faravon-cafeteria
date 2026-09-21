-- Язык получателя для многоязычных рассылок. Идемпотентно.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locale" TEXT;
ALTER TABLE "TelegramGuest" ADD COLUMN IF NOT EXISTS "locale" TEXT;
