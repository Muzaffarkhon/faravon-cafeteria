-- Ссылки привязки телефона кассы (подрядчик входит без пароля). Идемпотентно.
CREATE TABLE IF NOT EXISTS "CashierLink" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "usedIp"    TEXT,
  "usedAgent" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashierLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashierLink_tokenHash_key" ON "CashierLink"("tokenHash");
CREATE INDEX IF NOT EXISTS "CashierLink_userId_idx" ON "CashierLink"("userId");

DO $$ BEGIN
  ALTER TABLE "CashierLink"
    ADD CONSTRAINT "CashierLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Защита в глубину: закрываем прямой доступ через REST Supabase.
ALTER TABLE "CashierLink" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "CashierLink" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "CashierLink" FROM authenticated;
  END IF;
END $$;
