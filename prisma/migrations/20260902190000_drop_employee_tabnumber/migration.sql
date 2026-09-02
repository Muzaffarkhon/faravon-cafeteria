-- Табельный номер больше не используется — убираем поле и его уникальный индекс.
DROP INDEX IF EXISTS "Employee_tabNumber_key";
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "tabNumber";
