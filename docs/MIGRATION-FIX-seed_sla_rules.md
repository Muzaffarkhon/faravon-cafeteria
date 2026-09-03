# Одноразовый шаг на проде: миграция `20260902050000_seed_sla_rules`

## Что было

Миграция `20260902050000_seed_sla_rules` вставляла строки с ролью `APPROVER`,
которую предыдущая миграция `20260901221727_roles_and_banners` уже удалила из
enum `Role`. На **чистой** БД `prisma migrate deploy` падал:

```
ERROR: invalid input value for enum "Role": "APPROVER"
```

Из-за этого:
- CI (`verify` job) был красный на каждом коммите в `main`;
- новый прод / восстановление из бэкапа / локальная БД нового разработчика не поднимались;
- Vercel-сборка прода (`scripts/predeploy.mjs` → `prisma migrate deploy`) сломалась бы на следующей же ожидающей миграции.

## Что изменено

Файл миграции отредактирован: `APPROVER` / `SUPERADMIN` → `C_AND_B` (актуальный enum).
Строки вставляются только если таблица `SlaEscalationRule` пуста
(`WHERE NOT EXISTS`), поэтому повторный прогон безопасен.

Проверено: полный `prisma migrate deploy` на чистой БД + `prisma migrate diff`
(нет дрейфа) + строки SLA создаются с ролью `C_AND_B`.

## Что сделать на проде ОДИН РАЗ

На проде эта миграция уже отмечена как применённая, поэтому у изменённого файла
не совпадёт контрольная сумма и следующий `migrate deploy` упадёт с
`migration ... was modified after it was applied`.

Реши это так (на проде `SlaEscalationRule` уже заполнена, поэтому повторный
прогон миграции — гарантированный no-op из-за `WHERE NOT EXISTS`):

```bash
# DATABASE_URL = боевая строка Neon (unpooled/direct, а не pooled)
npx prisma migrate resolve --rolled-back 20260902050000_seed_sla_rules
npx prisma migrate deploy   # заново применит миграцию (no-op) и запишет новую контрольную сумму
```

После этого `prisma migrate status` должен показать «Database schema is up to date!».

Если по какой-то причине `SlaEscalationRule` на проде окажется пустой — миграция
просто создаст две базовые строки (level 1 / 72 ч / C_AND_B, level 2 / 120 ч / C_AND_B),
что и требуется.
