-- Нормализованный телефон (последние 9 цифр) для быстрого поиска при входе через Telegram.
ALTER TABLE "Employee" ADD COLUMN "phoneNormalized" TEXT;

-- Бэкофилл из существующих номеров по той же логике, что normalizePhone():
--   digits -> убрать префикс 992 (если >=12) -> убрать ведущий 0 (если длина 10) -> последние 9.
UPDATE "Employee" e
SET "phoneNormalized" = (
  SELECT CASE WHEN length(s2) > 9 THEN right(s2, 9) ELSE s2 END
  FROM (
    SELECT CASE WHEN length(s1) = 10 AND left(s1, 1) = '0' THEN substr(s1, 2) ELSE s1 END AS s2
    FROM (
      SELECT CASE WHEN length(s0) >= 12 AND left(s0, 3) = '992' THEN substr(s0, 4) ELSE s0 END AS s1
      FROM (SELECT regexp_replace(e."phone", '\D', '', 'g') AS s0) q0
    ) q1
  ) q2
)
WHERE e."phone" IS NOT NULL AND e."phone" <> '';

CREATE INDEX "Employee_phoneNormalized_idx" ON "Employee"("phoneNormalized");
