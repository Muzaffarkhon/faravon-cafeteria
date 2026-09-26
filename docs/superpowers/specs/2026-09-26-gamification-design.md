# Спека: геймификация — Farovon Coins

**Дата:** 26 сентября 2026 г.
**Статус:** согласовано с пользователем, готово к написанию плана реализации.

## 1. Цель

Сейчас `/gamification` — заглушка «скоро» ([page.tsx](../../../src/app/(app)/gamification/page.tsx)),
пункт вынесен в группу «Скоро» в навигации ([_nav.ts](../../../src/app/(app)/_nav.ts)).

Задача: ввести внутреннюю валюту **Farovon Coin** — сотрудники получают монеты
за выполнение задач (заданных C&B), и тратят монеты на купоны льгот из
«Кафетерия льгот». Цели по приоритету: использование льгот → вовлечённость в
платформу → обратная связь.

Мировая практика (Terryberry, Vantage Circle, Achievers, 2025–2026): экономика
«монеты + магазин наград» поверх каталога заданий — стандартная модель
(«coin-and-badge»), с пилотным запуском на части аудитории, наглядным балансом/
прогрессом и регулярным обновлением каталога наград. В v1 берём ядро этой
модели (задачи → монеты → магазин), без лидербордов/бейджей/стриков — это
осознанно вынесено в бэклог (см. §8).

## 2. Модель данных

Новые таблицы в `prisma/schema.prisma`, по образцу существующей связки
`CashbackAccount`/`CashbackEntry` ([schema.prisma:483](../../../prisma/schema.prisma))
— тот же принцип: баланс = сумма журнала, идемпотентность через `opKey`.

```prisma
enum TaskScope {
  ALL
  DEPARTMENT
  SPECIFIC
}

enum GamificationVerification {
  MANUAL
  AUTO
}

enum GamificationAutoMetric {
  APPLICATIONS_ON_TIME   // заявки поданы до дедлайна периода (Application/Period)
  COUPONS_USED           // погашенные купоны (Coupon.status = USED)
  FEEDBACK_GIVEN         // SatisfactionResponse.count
  LOGIN_STREAK_DAYS      // подряд дней с login (User.lastLoginAt, считает cron)
}

enum EmployeeTaskStatus {
  IN_PROGRESS
  COMPLETED
  EXPIRED
}

enum CoinEntryKind {
  EARNED
  SPENT
  REVERSED
}

enum CoinRedemptionMode {
  INSTANT
  REQUEST
}

enum CoinRedemptionStatus {
  PENDING
  APPROVED
  REJECTED
  FULFILLED
}

model GamificationTask {
  id          String                     @id @default(cuid())
  seq         Int                        @unique @default(autoincrement())
  title       String
  description String
  coinReward  Int
  verification GamificationVerification
  autoMetric  GamificationAutoMetric?
  targetValue Int?                       // порог для AUTO (напр. 30 дней, 5 купонов)
  scope       TaskScope                  @default(ALL) // ALL | DEPARTMENT | SPECIFIC
  department  String?                    // при scope = DEPARTMENT
  employeeIds String[]                   // при scope = SPECIFIC (Postgres string[])
  startsAt    DateTime
  endsAt      DateTime?
  isActive    Boolean                    @default(true)
  createdById String
  createdAt   DateTime                   @default(now())
  updatedAt   DateTime                   @updatedAt

  employeeTasks EmployeeTask[]

  @@index([isActive, startsAt])
}

model EmployeeTask {
  id            String             @id @default(cuid())
  employee      Employee           @relation(fields: [employeeId], references: [id])
  employeeId    String
  task          GamificationTask   @relation(fields: [taskId], references: [id])
  taskId        String
  status        EmployeeTaskStatus @default(IN_PROGRESS)
  progressValue Int                @default(0)
  prizeCardId   String?            // BenefitCard, если приз выбран заранее
  joinedAt      DateTime           @default(now())
  completedAt   DateTime?
  confirmedById String?            // для MANUAL — кто отметил выполнение

  @@unique([employeeId, taskId])
  @@index([status])
}

model CoinAccount {
  id         String   @id @default(cuid())
  employee   Employee @relation(fields: [employeeId], references: [id])
  employeeId String   @unique
  balance    Int      @default(0)
  updatedAt  DateTime @updatedAt

  entries CoinEntry[]
}

model CoinEntry {
  id           String        @id @default(cuid())
  account      CoinAccount   @relation(fields: [accountId], references: [id])
  accountId    String
  kind         CoinEntryKind
  amount       Int           // всегда > 0
  reason       String
  taskId       String?
  redemptionId String?
  opKey        String        @unique
  reversesEntryId String?    @unique
  createdAt    DateTime      @default(now())

  @@index([accountId, createdAt])
}

model CoinRedemption {
  id            String                @id @default(cuid())
  employee      Employee              @relation(fields: [employeeId], references: [id])
  employeeId    String
  benefitCard   BenefitCard           @relation(fields: [benefitCardId], references: [id])
  benefitCardId String
  coinCost      Int
  mode          CoinRedemptionMode
  status        CoinRedemptionStatus  @default(PENDING)
  couponId      String?
  decidedById   String?
  decidedAt     DateTime?
  createdAt     DateTime              @default(now())

  @@index([employeeId])
  @@index([status])
}
```

`BenefitCard` получает опциональные поля:

```prisma
coinPrice          Int?
coinRedemptionMode CoinRedemptionMode?  // null = карточка не продаётся за монеты
```

## 3. Жизненный цикл задачи

1. C&B создаёт задачу в новой админ-секции `/admin/gamification`
   (по образцу `/admin/satisfaction`): название, описание, награда в монетах,
   тип проверки, при `AUTO` — метрика и порог, область действия, сроки.
2. Сотрудник на `/gamification` видит список активных задач, доступных ему
   (по `scope`), может **взять задачу** (`EmployeeTask` создаётся при клике —
   аналог «взять в работу»), опционально сразу выбрать приз из карточек с
   `coinPrice` (`prizeCardId`).
3. Прогресс:
   - **AUTO** — новый cron-роут `/api/cron/gamification-tasks`
     (по образцу [deliver-notifications](../../../src/app/api/cron/deliver-notifications))
     раз в сутки пересчитывает `progressValue` для всех `IN_PROGRESS` задач с
     `verification = AUTO`, используя уже существующие данные (`Application`,
     `Coupon`, `SatisfactionResponse`, `User.lastLoginAt`), и переводит в
     `COMPLETED` при достижении `targetValue`.
     **Важно**: проект на Vercel Hobby, крон ограничен (см.
     [CRON-SETUP.md](../../CRON-SETUP.md)) — новый роут добавляется во внешний
     планировщик (cron-job.org), а не в `vercel.json`, как уже сделано для
     `sla-escalations`.
   - **MANUAL** — C&B отмечает `EmployeeTask` выполненной в `/admin/gamification`
     (`confirmedById` = текущий админ).
4. При переходе в `COMPLETED`: начисление `CoinEntry(EARNED)` на `CoinAccount`
   сотрудника. Если `prizeCardId` задан — сразу инициируется списание на этот
   приз (см. §4, тем же кодом, что и ручная покупка в магазине).

## 4. Магазин — трата монет

`/gamification` показывает баланс и каталог `BenefitCard` с `coinPrice != null`.
Покупка вызывает общий server action `redeemWithCoins(employeeId, benefitCardId)`:

- Проверка `balance >= coinPrice`, списание `CoinEntry(SPENT)`, создание
  `CoinRedemption`.
- `mode = INSTANT` — синхронно выпускается `Coupon` (переиспользуется текущая
  логика выдачи купона, см. [coupons/actions.ts](../../../src/app/(app)/coupons/actions.ts)),
  `CoinRedemption.status = FULFILLED`.
- `mode = REQUEST` — `CoinRedemption.status = PENDING`, монеты списаны сразу
  (эскроу); C&B в `/admin/gamification` одобряет (→ `Coupon` выпускается,
  `FULFILLED`) или отклоняет (→ `CoinEntry(REVERSED)` возвращает монеты,
  `REJECTED`).

`opKey` защищает от двойного клика — та же схема, что в `CashbackEntry`.

## 5. Права и навигация

- Новая запись в `PERMISSIONS` в [rbac.ts](../../../src/lib/rbac.ts):
  `"gamification.manage": ["C_AND_B"]`, подпись «Геймификация».
- `/admin/gamification` — новая страница в `(admin)`, защищена этим правом
  (по образцу `/admin/satisfaction`).
- `/gamification` (сотрудник) убирается из группы «Скоро» в
  [_nav.ts](../../../src/app/(app)/_nav.ts) — переносится в основной список меню.
- i18n: ключи `gamification.*` в [dict.ts](../../../src/lib/i18n/dict.ts) уже
  частично есть (`title`, `soon`, `wip`, `wipText` — заглушка); добавляются
  новые под реальный контент (все 3 языка: ru/tg/uz).

## 6. Тестирование

- Ручная проверка сценариев (dev-окружение, Neon):
  взять задачу → (для MANUAL) C&B отмечает выполненной → монеты начислены →
  покупка INSTANT-карточки → баланс списан, купон появился в «Мои купоны» →
  покупка REQUEST-карточки → заявка видна в `/admin/gamification` → одобрение
  выдаёт купон / отклонение возвращает монеты.
- Для AUTO-задачи: прогнать cron-роут вручную (`curl` с `CRON_SECRET`, как
  описано в CRON-SETUP.md) на тестовых данных, проверить пересчёт и авто-закрытие.
- `npx tsc --noEmit` и `npm run build` перед сдачей — как в прошлых хендофах.
- Миграция применяется вручную на прод по существующей процедуре (нет рабочего
  `DIRECT_URL` локально) — см. [HANDOFF-2026-09-14.md §2](../../HANDOFF-2026-09-14.md).

## 7. Границы (что НЕ входит в v1)

- Лидерборды, бейджи, стрики как отдельная витрина — бэклог, не блокирует v1.
- Автоматическая интеграция с табельным учётом/опозданиями — такой системы в
  проекте нет; всё, что требует внешних данных о посещаемости, оформляется как
  `MANUAL`-задача, которую закрывает C&B/руководитель.
- Истечение неиспользованных монет (индустриальная практика 12–18 мес.) — не
  делаем в v1, т.к. не обсуждалось; можно добавить позже как cron-джобу.

## 8. Открытые вопросы для следующей сессии

Нет блокирующих — все ключевые решения приняты пользователем (гибридная
проверка задач, employee выбирает задачу/приз заранее, C&B решает режим
INSTANT/REQUEST на уровне карточки).
