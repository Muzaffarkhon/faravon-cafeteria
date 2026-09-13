-- Дополнительный телефон сотрудника и его нормализованное значение для Telegram-бота
ALTER TABLE "Employee" ADD COLUMN "phoneSecondary" TEXT;
ALTER TABLE "Employee" ADD COLUMN "phoneSecondaryNormalized" TEXT;

CREATE INDEX "Employee_phoneSecondaryNormalized_idx" ON "Employee"("phoneSecondaryNormalized");
