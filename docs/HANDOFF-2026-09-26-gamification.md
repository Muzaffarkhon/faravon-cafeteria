# Хендоф — геймификация Farovon Coins (в процессе)

**Дата составления:** 26 сентября 2026 г.
**Ветка Git:** `work/laptop` (все коммиты уже в ней, ничего не в ожидании).
**Статус:** реализация по плану, выполнено 4 из 10 задач, работа приостановлена по просьбе пользователя (смена аккаунта), не по блокеру.

---

## Что это и где искать

Новая фича «Farovon Coins»: задачи от C&B → монеты сотруднику → покупка купона льготы за монеты.

- **Спека:** [docs/superpowers/specs/2026-09-26-gamification-design.md](superpowers/specs/2026-09-26-gamification-design.md)
- **План реализации (10 задач, полный код по каждой):** [docs/superpowers/plans/2026-09-26-gamification-coins.md](superpowers/plans/2026-09-26-gamification-coins.md)
- **Лог выполнения (SDD-ledger, git-ignored, но лежит на диске):** `.superpowers/sdd/2026-09-26-gamification-coins/progress.md` — это первоисточник по деталям, ниже только выжимка.

## Как продолжить в новой сессии

1. Открыть план (`docs/superpowers/plans/2026-09-26-gamification-coins.md`) и этот файл.
2. Прочитать ledger `.superpowers/sdd/2026-09-26-gamification-coins/progress.md` — там все решения и находки по уже сделанным задачам.
3. Вызвать skill **subagent-driven-development** (или просто попросить «продолжи план геймификации, задачи 1–4 готовы») — она сама подхватит ledger и продолжит с Task 5.
4. Бриф для Task 5 уже подготовлен: `.superpowers/sdd/2026-09-26-gamification-coins/task-5-brief.md`.

## Сделано (коммиты в work/laptop, все закоммичены, ревью пройдено)

| Задача | Коммит(ы) | Что |
|---|---|---|
| Task 1 — схема БД | `1f44974`→`af0aa14` | 7 enum'ов, 5 таблиц (`GamificationTask`, `EmployeeTask`, `CoinAccount`, `CoinEntry`, `CoinRedemption`), 2 поля на `BenefitCard`. Миграция `20260926121756_gamification_coins` применена вручную к боевой Supabase-БД (`prisma migrate diff` + `migrate deploy`, без shadow DB). |
| Task 2 — RBAC | `76850a0` | Право `gamification.manage` (роль C_AND_B). |
| Task 3 — кошелёк монет | `50bf9ce` | `src/lib/coin-wallet.ts`: `creditCoins`/`spendCoins`/`reverseSpend`/`getCoinBalance`/`listCoinEntries`, идемпотентно по `opKey`, копия паттерна `cashback.ts`. Один раунд фикса (гонка в `reverseSpend`, P2002). |
| Task 4 — цена на карточке | `0fb96de` | `/admin/cards`: поля «Цена в Farovon Coin» + режим покупки (INSTANT/REQUEST), валидация (только для `minParticipants=1`). |

## Важные технические находки (учтены в коде, но важно знать)

1. **БД теперь на Supabase, не Neon** (мигрировали 15 сентября, см. `docs/MIGRATION-PLAN-SUPABASE.md`). `.env` указывает на **боевую** БД напрямую — отдельного dev-инстанса нет, это принятая практика проекта.
2. **`SHADOW_DATABASE_URL` в `.env` больше не рабочий** (указывает на несуществующий локальный Docker-Postgres) — `prisma migrate dev` не работает. Для будущих миграций схемы использовать: `npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` → вручную проверить, что SQL строго аддитивный → сохранить в `prisma/migrations/<timestamp>_<name>/migration.sql` → `npx prisma migrate deploy` (не нужен shadow DB) → `npx prisma generate`.
3. **На этом ноутбуке параллельно могут быть запущены dev-серверы других сессий** (`next dev -p 3001` и т.п.) на этом же репозитории — они держат файл `query_engine-windows.dll.node` заблокированным, из-за чего `prisma generate` падает с `EPERM`. Лечится остановкой чужого dev-сервера (`taskkill /PID <pid> /T /F` в своём терминале — агент это делать не может, харнесс блокирует межсессионное вмешательство).
4. **Работа идёт в одной ветке `work/laptop` без git worktree** — несколько сессий могут коммитить в неё параллельно. При генерации диапазона для ревью всегда проверять `git log <base>..<head>` на предмет чужих коммитов, затесавшихся между записанным BASE и текущим HEAD (уже случилось один раз на Task 4 — коммит `493558f`, сделанный пользователем напрямую).
5. **`src/lib/i18n/dict.ts` — общий файл**, в него же параллельно писала другая сессия (фича автоперевода). При правке — только `git add` точечно нужных строк, никогда `git add -A`/`git add .`.
6. Отклонение от черновика спеки (осознанное, задокументировано в плане): `GamificationAutoMetric` сокращён до `APPLICATIONS_SUBMITTED`/`COUPONS_USED`/`FEEDBACK_GIVEN` — метрики про опоздания/стрик входа убраны как невычислимые без табельного учёта.

## Осталось (задачи 5–10 по плану)

5. Библиотека покупки купона за монеты (`src/lib/coin-redemption.ts`) — бриф готов.
6. Библиотека задач геймификации (`src/lib/gamification-tasks.ts`).
7. Cron-роут авто-проверки задач.
8. Админка `/admin/gamification`.
9. Страница сотрудника `/gamification` (убрать заглушку «скоро»).
10. E2E-скрипт и финальная сборка.

Плюс отложенные минорные находки ревью (не блокируют, см. ledger): косметическое форматирование в `schema.prisma` (`npx prisma format` поправит), устаревший финальный раздел `task-1-report.md`, отсутствие живой браузерной проверки Task 4 (нет доступа к реальным C&B-логину в проде — стоит один раз вручную проверить `/admin/cards` после запуска).
