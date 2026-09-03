-- §5.12: базовая матрица SLA-эскалаций. Без строк в этой таблице cron
-- /api/cron/sla-escalations ничего не делает. Заполняем, только если пусто,
-- чтобы не перетереть настройку контент-менеджера.
--
-- ВАЖНО: роли здесь должны быть из АКТУАЛЬНОГО enum `Role`
-- (C_AND_B / EMPLOYEE / CONTRACTOR). Предыдущая миграция
-- 20260901221727_roles_and_banners уже удалила APPROVER/SUPERADMIN, поэтому
-- ссылка на них здесь ломает `migrate deploy` на чистой БД
-- (`invalid input value for enum "Role": "APPROVER"`). Legacy-роли
-- согласующих свёрнуты в C_AND_B.
INSERT INTO "SlaEscalationRule" ("id", "level", "afterHours", "notifyRoles", "active", "updatedAt")
SELECT gen_random_uuid()::text, v.level, v.hours, v.roles::"Role"[], true, CURRENT_TIMESTAMP
FROM (VALUES
  (1, 72,  ARRAY['C_AND_B']),
  (2, 120, ARRAY['C_AND_B'])
) AS v(level, hours, roles)
WHERE NOT EXISTS (SELECT 1 FROM "SlaEscalationRule");
