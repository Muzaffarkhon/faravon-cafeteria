-- §5.12: базовая матрица SLA-эскалаций. Без строк в этой таблице cron
-- /api/cron/sla-escalations ничего не делает. Заполняем, только если пусто,
-- чтобы не перетереть настройку контент-менеджера.
INSERT INTO "SlaEscalationRule" ("id", "level", "afterHours", "notifyRoles", "active", "updatedAt")
SELECT gen_random_uuid()::text, v.level, v.hours, v.roles::"Role"[], true, CURRENT_TIMESTAMP
FROM (VALUES
  (1, 72,  ARRAY['APPROVER']),
  (2, 120, ARRAY['APPROVER','SUPERADMIN'])
) AS v(level, hours, roles)
WHERE NOT EXISTS (SELECT 1 FROM "SlaEscalationRule");
