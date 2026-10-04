-- Дата и время активации купона.
ALTER TABLE "Coupon" ADD COLUMN "activatedAt" TIMESTAMP(3);

-- Бэкфилл по журналу аудита: первое погашение/визит каждого купона.
UPDATE "Coupon" c
SET "activatedAt" = a.first_at
FROM (
  SELECT "entityId", MIN("createdAt") AS first_at
  FROM "AuditLog"
  WHERE "entityType" = 'Coupon'
    AND "action" IN ('COUPON_REDEEMED_BY_PROVIDER', 'COUPON_FORCE_REDEEMED_BY_ADMIN', 'COUPON_VISIT_BY_PROVIDER')
  GROUP BY "entityId"
) a
WHERE c."id" = a."entityId";
