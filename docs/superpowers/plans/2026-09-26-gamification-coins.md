# Farovon Coins (геймификация) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ввести внутреннюю валюту Farovon Coin: сотрудники получают монеты за задачи от C&B (ручная или авто-проверка), тратят монеты на купоны льгот из магазина, C&B управляет ценами и режимом покупки на карточках.

**Architecture:** 5 новых таблиц (`GamificationTask`, `EmployeeTask`, `CoinAccount`, `CoinEntry`, `CoinRedemption`) + 2 новых поля на `BenefitCard` (`coinPrice`, `coinRedemptionMode`). Монетный баланс — журнал (`CoinEntry`) с идемпотентным `opKey`, точная копия паттерна `CashbackAccount`/`CashbackEntry`. Покупка купона за монеты **не меняет модель `Coupon`**: под капотом создаётся обычная связка `Application`+`ApplicationItem` (как при обычном выборе льготы) и переиспользуется существующий `formCouponForItem`/`issueCouponIfReady` — так купон корректно появляется во всех местах, которые уже умеют его показывать (реестр купонов, «Мои заявки» сотрудника, кабинет партнёра).

**Tech Stack:** Next.js App Router (server actions), Prisma/PostgreSQL (Neon), существующий RBAC (`src/lib/rbac.ts`), i18n-словарь (`src/lib/i18n/dict.ts`), Vercel cron (внешний планировщик cron-job.org для реальной периодичности).

**Spec:** [docs/superpowers/specs/2026-09-26-gamification-design.md](../specs/2026-09-26-gamification-design.md)

## Global Constraints

- Проект на **Vercel Hobby**: новый cron-роут добавляется во внешний планировщик (cron-job.org), не в `vercel.json` (см. [CRON-SETUP.md](../../CRON-SETUP.md)).
- В приложении **нет данных о посещаемости/опозданиях** — задачи такого рода создаются только с `verification = MANUAL`, без `autoMetric`.
- **Отклонение от спеки (уточнение при реализации):** `autoMetric` сокращён до трёх реально вычислимых метрик: `APPLICATIONS_SUBMITTED`, `COUPONS_USED`, `FEEDBACK_GIVEN`. `NO_LATE_DAYS` и `LOGIN_STREAK_DAYS` из черновика спеки убраны — первая требует несуществующих данных о посещаемости, вторая (стрик по `User.lastLoginAt`) требует пер-дневного лога, которого сейчас нет, и её точная реализация — отдельная задача не в этом скоупе.
- Купон, выданный за монеты, продаётся только для карточек с `minParticipants = 1` и партнёром, у которого `deliveryMode !== "PHONE_PROMO"` — групповые льготы и льготы «по номеру телефона» не формируют `Coupon` синхронно (см. существующий `formCouponForItem`), поэтому исключены из товаров за монеты.
- В проекте нет unit-test фреймворка (нет jest/vitest) — верификация: `npx tsc --noEmit`, `npm run build`, и e2e-скрипт на `tsx` по образцу [scripts/flow-e2e.ts](../../../scripts/flow-e2e.ts), запускаемый вручную против dev-БД (Neon).
- Переводы tg/uz — машинные (см. шапку [dict.ts](../../../src/lib/i18n/dict.ts)), это принятая практика проекта.
- Все server actions — `assertCan(session.roles, "gamification.manage")` для C&B-операций; `requireSession()` для операций сотрудника.

---

## Task 1: Схема БД — таблицы геймификации и поля на BenefitCard

**Files:**
- Modify: `prisma/schema.prisma`
- Test: ручной прогон миграции

**Interfaces:**
- Produces: Prisma-модели `GamificationTask`, `EmployeeTask`, `CoinAccount`, `CoinEntry`, `CoinRedemption`; enums `TaskScope`, `GamificationVerification`, `GamificationAutoMetric`, `EmployeeTaskStatus`, `CoinEntryKind`, `CoinRedemptionMode`, `CoinRedemptionStatus`; новые поля `BenefitCard.coinPrice`, `BenefitCard.coinRedemptionMode`.

- [ ] **Step 1: Добавить enum'ы и модели в schema.prisma**

Открыть [prisma/schema.prisma](../../../prisma/schema.prisma), найти модель `BenefitCard` (строка ~273) и добавить в неё 2 новых поля перед `partner   Partner? @relation(...)`:

```prisma
  coinPrice          Int?
  coinRedemptionMode CoinRedemptionMode?
```

и в конец блока relations этой модели добавить:

```prisma
  coinRedemptions CoinRedemption[]
```

В модель `Employee` (строка ~125), в блок relations (рядом с `cashbackAccounts`), добавить:

```prisma
  coinAccount      CoinAccount?
  employeeTasks    EmployeeTask[]
  coinRedemptions  CoinRedemption[]
```

В конец файла добавить:

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

/// Метрики, которые можно вычислить из уже существующих данных приложения —
/// без интеграции с табельным учётом (его в проекте нет).
enum GamificationAutoMetric {
  APPLICATIONS_SUBMITTED
  COUPONS_USED
  FEEDBACK_GIVEN
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

/// Шаблон задачи геймификации, создаёт C&B. Сотрудник «берёт» задачу в работу
/// (EmployeeTask), после чего прогресс проверяется либо вручную C&B, либо
/// автоматически cron-роутом (см. src/lib/gamification-tasks.ts).
model GamificationTask {
  id           String                    @id @default(cuid())
  seq          Int                       @unique @default(autoincrement())
  title        String
  description  String
  coinReward   Int
  verification GamificationVerification
  autoMetric   GamificationAutoMetric?
  targetValue  Int?
  scope        TaskScope                 @default(ALL)
  department   String?
  employeeIds  String[]                  @default([])
  startsAt     DateTime                  @default(now())
  endsAt       DateTime?
  isActive     Boolean                   @default(true)
  createdById  String
  createdAt    DateTime                  @default(now())
  updatedAt    DateTime                  @updatedAt

  employeeTasks EmployeeTask[]

  @@index([isActive, startsAt])
}

/// Задача, которую сотрудник взял в работу. Уникальность по паре —
/// нельзя взять одну и ту же задачу дважды.
model EmployeeTask {
  id            String             @id @default(cuid())
  employee      Employee           @relation(fields: [employeeId], references: [id])
  employeeId    String
  task          GamificationTask   @relation(fields: [taskId], references: [id])
  taskId        String
  status        EmployeeTaskStatus @default(IN_PROGRESS)
  progressValue Int                @default(0)
  prizeCardId   String?
  joinedAt      DateTime           @default(now())
  completedAt   DateTime?
  confirmedById String?

  @@unique([employeeId, taskId])
  @@index([status])
}

/// Баланс монет сотрудника — один счёт на сотрудника (в отличие от кешбека,
/// монеты не привязаны к партнёру).
model CoinAccount {
  id         String   @id @default(cuid())
  employee   Employee @relation(fields: [employeeId], references: [id])
  employeeId String   @unique
  balance    Int      @default(0)
  updatedAt  DateTime @updatedAt

  entries CoinEntry[]
}

/// Журнал операций по монетам: баланс = сумма EARNED − сумма SPENT + сумма
/// REVERSED-компенсаций. opKey защищает от повторного начисления/списания.
model CoinEntry {
  id              String        @id @default(cuid())
  account         CoinAccount   @relation(fields: [accountId], references: [id])
  accountId       String
  kind            CoinEntryKind
  amount          Int
  reason          String
  taskId          String?
  redemptionId    String?
  opKey           String        @unique
  reversesEntryId String?       @unique
  createdAt       DateTime      @default(now())

  @@index([accountId, createdAt])
}

/// Покупка карточки-льготы за монеты. INSTANT выполняется сразу (fulfillCoinRedemption
/// вызывается синхронно), REQUEST ждёт решения C&B.
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

- [ ] **Step 2: Сгенерировать и применить миграцию**

Run: `npx prisma migrate dev --name gamification_coins`

Expected: миграция создаётся в `prisma/migrations/<timestamp>_gamification_coins/` и применяется к БД из `DATABASE_URL`/`DIRECT_URL` в `.env` без ошибок; в конце — `✔ Generated Prisma Client`.

- [ ] **Step 3: Проверить типы**

Run: `npx tsc --noEmit`

Expected: 0 ошибок (в проекте пока нет кода, использующего новые модели, — проверяем, что сама схема не сломала существующие типы).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(gamification): схема БД — задачи, монеты, магазин купонов"
```

---

## Task 2: RBAC-право `gamification.manage`

**Files:**
- Modify: `src/lib/rbac.ts`

**Interfaces:**
- Produces: `Permission` включает `"gamification.manage"`, доступно через `can(roles, "gamification.manage")` / `assertCan(...)`.

- [ ] **Step 1: Добавить право в матрицу и подписи**

В [src/lib/rbac.ts](../../../src/lib/rbac.ts) добавить в `DEFAULT_PERMISSIONS` (после `"satisfaction.manage": ["C_AND_B"],`):

```typescript
  "gamification.manage": ["C_AND_B"],
```

и в `PERMISSION_LABELS` (после `"satisfaction.manage": "Опрос удовлетворённости",`):

```typescript
  "gamification.manage": "Геймификация: задачи, монеты, магазин",
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`

Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rbac.ts
git commit -m "feat(gamification): право gamification.manage"
```

---

## Task 3: Библиотека кошелька монет

**Files:**
- Create: `src/lib/coin-wallet.ts`
- Test: `scripts/gamification-e2e.ts` (создаётся в Task 10, здесь — ручная проверка через `tsx`)

**Interfaces:**
- Consumes: `db` из `@/lib/db`.
- Produces:
  - `class CoinWalletError extends Error`
  - `getCoinBalance(employeeId: string): Promise<number>`
  - `creditCoins(params: { employeeId: string; amount: number; reason: string; opKey: string; taskId?: string }): Promise<void>`
  - `spendCoins(params: { employeeId: string; amount: number; reason: string; opKey: string; redemptionId?: string }): Promise<void>` — бросает `CoinWalletError`, если баланс меньше `amount`.
  - `reverseSpend(params: { opKey: string; reason: string }): Promise<void>` — компенсирует ранее списанные монеты (по `opKey` записи `SPENT`), возвращает баланс.
  - `listCoinEntries(employeeId: string, take?: number)`

- [ ] **Step 1: Написать `src/lib/coin-wallet.ts`**

```typescript
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export class CoinWalletError extends Error {}

async function ensureAccount(employeeId: string) {
  return db.coinAccount.upsert({
    where: { employeeId },
    create: { employeeId },
    update: {},
  });
}

export async function getCoinBalance(employeeId: string): Promise<number> {
  const account = await db.coinAccount.findUnique({ where: { employeeId }, select: { balance: true } });
  return account?.balance ?? 0;
}

/** Начисление монет. Idempotent по opKey — повторный вызов с тем же ключом ничего не меняет. */
export async function creditCoins(params: {
  employeeId: string;
  amount: number;
  reason: string;
  opKey: string;
  taskId?: string;
}): Promise<void> {
  if (!Number.isSafeInteger(params.amount) || params.amount <= 0) {
    throw new CoinWalletError("Сумма начисления должна быть положительным целым числом.");
  }
  const existing = await db.coinEntry.findUnique({ where: { opKey: params.opKey } });
  if (existing) return;

  try {
    await db.$transaction(async (tx) => {
      const account = await tx.coinAccount.upsert({
        where: { employeeId: params.employeeId },
        create: { employeeId: params.employeeId },
        update: {},
      });
      await tx.coinAccount.update({ where: { id: account.id }, data: { balance: { increment: params.amount } } });
      await tx.coinEntry.create({
        data: {
          accountId: account.id,
          kind: "EARNED",
          amount: params.amount,
          reason: params.reason,
          taskId: params.taskId,
          opKey: params.opKey,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return; // параллельный дубль — уже начислено
    throw e;
  }
}

/** Списание монет. Idempotent по opKey. Баланс не уходит в минус (условный decrement). */
export async function spendCoins(params: {
  employeeId: string;
  amount: number;
  reason: string;
  opKey: string;
  redemptionId?: string;
}): Promise<void> {
  if (!Number.isSafeInteger(params.amount) || params.amount <= 0) {
    throw new CoinWalletError("Сумма списания должна быть положительным целым числом.");
  }
  const existing = await db.coinEntry.findUnique({ where: { opKey: params.opKey } });
  if (existing) return;

  try {
    await db.$transaction(async (tx) => {
      const account = await ensureAccount(params.employeeId);
      const claimed = await tx.coinAccount.updateMany({
        where: { id: account.id, balance: { gte: params.amount } },
        data: { balance: { decrement: params.amount } },
      });
      if (claimed.count === 0) throw new CoinWalletError("Недостаточно монет на балансе.");
      await tx.coinEntry.create({
        data: {
          accountId: account.id,
          kind: "SPENT",
          amount: params.amount,
          reason: params.reason,
          redemptionId: params.redemptionId,
          opKey: params.opKey,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

/** Возврат ранее списанных монет (отказ в REQUEST-покупке). Ищет запись SPENT по opKey. */
export async function reverseSpend(params: { opKey: string; reason: string }): Promise<void> {
  const spent = await db.coinEntry.findUnique({ where: { opKey: params.opKey } });
  if (!spent || spent.kind !== "SPENT") throw new CoinWalletError("Операция списания не найдена.");
  const reverseKey = `rev:${spent.id}`;
  const already = await db.coinEntry.findUnique({ where: { opKey: reverseKey } });
  if (already) return;

  await db.$transaction(async (tx) => {
    await tx.coinAccount.update({ where: { id: spent.accountId }, data: { balance: { increment: spent.amount } } });
    await tx.coinEntry.create({
      data: {
        accountId: spent.accountId,
        kind: "REVERSED",
        amount: spent.amount,
        reason: params.reason,
        redemptionId: spent.redemptionId,
        opKey: reverseKey,
        reversesEntryId: spent.id,
      },
    });
  });
}

export function listCoinEntries(employeeId: string, take = 20) {
  return db.coinEntry.findMany({
    where: { account: { is: { employeeId } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`

Expected: 0 ошибок.

- [ ] **Step 3: Ручная проверка через `tsx`**

Run (заменить `<employeeId>` на id реального сотрудника из dev-БД, например `npx tsx -e "..."`, или временный скрипт):

```bash
npx tsx -e "
import { creditCoins, spendCoins, getCoinBalance } from './src/lib/coin-wallet';
(async () => {
  const empId = process.argv[1];
  await creditCoins({ employeeId: empId, amount: 100, reason: 'test', opKey: 'test:credit:1' });
  console.log('after credit:', await getCoinBalance(empId));
  await spendCoins({ employeeId: empId, amount: 30, reason: 'test', opKey: 'test:spend:1' });
  console.log('after spend:', await getCoinBalance(empId));
  await creditCoins({ employeeId: empId, amount: 100, reason: 'test', opKey: 'test:credit:1' });
  console.log('after duplicate credit (should be unchanged):', await getCoinBalance(empId));
})();
" <employeeId>
```

Expected: `100`, затем `70`, затем `70` (повтор с тем же `opKey` не меняет баланс).

- [ ] **Step 4: Commit**

```bash
git add src/lib/coin-wallet.ts
git commit -m "feat(gamification): библиотека кошелька монет (начисление/списание/сторно)"
```

---

## Task 4: Цена и режим покупки на карточке льготы (админка)

**Files:**
- Modify: `src/app/(admin)/admin/cards/actions.ts`
- Modify: `src/app/(admin)/admin/cards/_form.tsx`
- Modify: `src/lib/i18n/dict.ts` (ключи `cards.form.coin*`)

**Interfaces:**
- Consumes: `CoinRedemptionMode` из `@prisma/client`.
- Produces: `CardValues` получает поля `coinPrice: number | null`, `coinRedemptionMode: string | null`; `parse()` в `actions.ts` валидирует и возвращает их в `data`.

- [ ] **Step 1: Расширить `parse()` и типы в `actions.ts`**

В [src/app/(admin)/admin/cards/actions.ts](../../../src/app/(admin)/admin/cards/actions.ts) добавить импорт `CoinRedemptionMode` в существующую строку импорта типов:

```typescript
import { Prisma, type BenefitMode, type Block, type CardStatus, type CoinRedemptionMode } from "@prisma/client";
```

В функции `parse()`, после блока `if (mode === "CASHBACK") { ... }`, добавить:

```typescript
  const coinPriceRaw = String(formData.get("coinPrice") ?? "").trim();
  let coinPrice: number | null = null;
  let coinRedemptionMode: CoinRedemptionMode | null = null;
  if (coinPriceRaw) {
    const parsed = Number.parseInt(coinPriceRaw, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Цена в монетах должна быть положительным целым числом.");
    if (minRaw > 1) throw new Error("Групповые льготы (минимум участников > 1) нельзя продавать за монеты.");
    const modeRaw = String(formData.get("coinRedemptionMode") ?? "INSTANT");
    if (modeRaw !== "INSTANT" && modeRaw !== "REQUEST") throw new Error("Некорректный режим покупки за монеты.");
    coinPrice = parsed;
    coinRedemptionMode = modeRaw;
  }
```

и в `return { ... }` добавить перед закрывающей скобкой:

```typescript
    coinPrice,
    coinRedemptionMode,
```

- [ ] **Step 2: Добавить поля в форму**

В [src/app/(admin)/admin/cards/_form.tsx](../../../src/app/(admin)/admin/cards/_form.tsx) добавить в тип `CardValues`:

```typescript
  coinPrice?: number | null;
  coinRedemptionMode?: string | null;
```

Добавить состояние и блок полей после блока `groupWaves` (внутри `{block === "FLEX" && (...)}`, сразу перед закрывающим `</>`):

```tsx
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("cards.form.coinPrice")} htmlFor="coinPrice" hint={t("cards.form.coinPriceHint")}>
              <Input
                id="coinPrice"
                type="number"
                inputMode="numeric"
                min={1}
                name="coinPrice"
                defaultValue={initial?.coinPrice ?? ""}
                placeholder={t("cards.form.coinPricePlaceholder")}
              />
            </Field>
            <Field label={t("cards.form.coinRedemptionMode")} htmlFor="coinRedemptionMode" hint={t("cards.form.coinRedemptionModeHint")}>
              <Select id="coinRedemptionMode" name="coinRedemptionMode" defaultValue={initial?.coinRedemptionMode ?? "INSTANT"}>
                <option value="INSTANT">{t("cards.form.coinModeInstant")}</option>
                <option value="REQUEST">{t("cards.form.coinModeRequest")}</option>
              </Select>
            </Field>
          </div>
```

- [ ] **Step 3: Добавить i18n-ключи**

В [src/lib/i18n/dict.ts](../../../src/lib/i18n/dict.ts), в блок `ru` рядом с другими `cards.form.*` ключами добавить:

```typescript
    "cards.form.coinPrice": "Цена в Farovon Coin",
    "cards.form.coinPriceHint": "Оставьте пустым, если карточка не продаётся за монеты. Доступно только для не-групповых льгот (минимум участников = 1).",
    "cards.form.coinPricePlaceholder": "например, 500",
    "cards.form.coinRedemptionMode": "Режим покупки за монеты",
    "cards.form.coinRedemptionModeHint": "«Сразу» — купон выдаётся мгновенно. «По согласованию» — заявка идёт C&B на одобрение.",
    "cards.form.coinModeInstant": "Сразу",
    "cards.form.coinModeRequest": "По согласованию",
```

В блок `tg`:

```typescript
    "cards.form.coinPrice": "Нархи бо Farovon Coin",
    "cards.form.coinPriceHint": "Агар корт барои тангаҳо фурӯхта нашавад, холӣ гузоред. Танҳо барои имтиёзҳои ғайригурӯҳӣ (ҳадди ақали иштирокчиён = 1) дастрас аст.",
    "cards.form.coinPricePlaceholder": "масалан, 500",
    "cards.form.coinRedemptionMode": "Тарзи харид бо тангаҳо",
    "cards.form.coinRedemptionModeHint": "«Дарҳол» — купон фавран дода мешавад. «Бо мувофиқа» — дархост барои тасдиқ ба C&B меравад.",
    "cards.form.coinModeInstant": "Дарҳол",
    "cards.form.coinModeRequest": "Бо мувофиқа",
```

В блок `uz`:

```typescript
    "cards.form.coinPrice": "Farovon Coin narxi",
    "cards.form.coinPriceHint": "Karta tangalarga sotilmasa, bo'sh qoldiring. Faqat guruhsiz imtiyozlar uchun (ishtirokchilar minimumi = 1) mavjud.",
    "cards.form.coinPricePlaceholder": "masalan, 500",
    "cards.form.coinRedemptionMode": "Tangalar bilan sotib olish rejimi",
    "cards.form.coinRedemptionModeHint": "«Darhol» — kupon zudlik bilan beriladi. «Kelishuv bo'yicha» — so'rov C&B tasdig'iga boradi.",
    "cards.form.coinModeInstant": "Darhol",
    "cards.form.coinModeRequest": "Kelishuv bo'yicha",
```

- [ ] **Step 4: Прокинуть значения из страниц new/[id] в форму**

В [src/app/(admin)/admin/cards/new/page.tsx](../../../src/app/(admin)/admin/cards/new/page.tsx) и [src/app/(admin)/admin/cards/[id]/page.tsx](../../../src/app/(admin)/admin/cards/[id]/page.tsx) найти место, где строится объект `initial`/передаётся карточка в `<CardForm initial={...}>`, и добавить в этот объект:

```typescript
    coinPrice: card.coinPrice,
    coinRedemptionMode: card.coinRedemptionMode,
```

(добавить рядом с уже проброшенными полями вроде `groupWaves`, `partnerId` — смотреть по фактической структуре объекта в каждом из двух файлов).

- [ ] **Step 5: Проверить типы и сборку**

Run: `npx tsc --noEmit && npm run build`

Expected: 0 ошибок, сборка проходит.

- [ ] **Step 6: Ручная проверка**

Запустить dev-сервер (`npm run dev`), зайти в `/admin/cards`, открыть/создать FLEX-карточку с `minParticipants = 1`, заполнить «Цена в Farovon Coin» = 500, режим «Сразу», сохранить. Открыть карточку повторно — убедиться, что значения сохранились. Попробовать поставить `minParticipants = 2` и цену — должна появиться ошибка «Групповые льготы… нельзя продавать за монеты.».

- [ ] **Step 7: Commit**

```bash
git add src/app/"(admin)"/admin/cards src/lib/i18n/dict.ts
git commit -m "feat(gamification): цена и режим покупки за монеты на карточке льготы"
```

---

## Task 5: Библиотека покупки купона за монеты (магазин)

**Files:**
- Create: `src/lib/coin-redemption.ts`

**Interfaces:**
- Consumes: `spendCoins`, `reverseSpend`, `CoinWalletError` из `@/lib/coin-wallet`; `formCouponForItem`, `issueCouponIfReady` из `@/lib/coupon-flow`; `audit` из `@/lib/audit`.
- Produces:
  - `class CoinRedemptionError extends Error`
  - `redeemWithCoins(params: { employeeId: string; benefitCardId: string; actorId: string }): Promise<{ redemptionId: string; status: "FULFILLED" | "PENDING" }>`
  - `decideCoinRedemption(params: { redemptionId: string; decision: "APPROVE" | "REJECT"; actorId: string }): Promise<void>`
  - (внутренняя, не экспортируется) `fulfillRedemption(redemptionId: string, actorId: string): Promise<void>` — синтезирует `Application`+`ApplicationItem`, вызывает `formCouponForItem`+`issueCouponIfReady`, привязывает `couponId` к `CoinRedemption`.

- [ ] **Step 1: Написать `src/lib/coin-redemption.ts`**

```typescript
import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { spendCoins, reverseSpend, CoinWalletError } from "@/lib/coin-wallet";
import { formCouponForItem, issueCouponIfReady } from "@/lib/coupon-flow";

export class CoinRedemptionError extends Error {}

/**
 * Синтезирует Application + ApplicationItem (в статусе APPROVED, как будто
 * C&B уже одобрил выбор) под самую свежую запись Period — это позволяет
 * переиспользовать существующий формирователь купона без изменений в модели
 * Coupon (которая всегда ссылается на ApplicationItem).
 */
async function fulfillRedemption(redemptionId: string, actorId: string): Promise<void> {
  const redemption = await db.coinRedemption.findUniqueOrThrow({
    where: { id: redemptionId },
    include: { benefitCard: true },
  });
  const period = await db.period.findFirst({ orderBy: { startDate: "desc" } });
  if (!period) throw new CoinRedemptionError("Нет ни одного периода в системе — не из чего сформировать купон.");

  const application = await db.application.create({
    data: { employeeId: redemption.employeeId, periodId: period.id },
  });
  const item = await db.applicationItem.create({
    data: { applicationId: application.id, cardId: redemption.benefitCardId, status: "APPROVED" },
  });

  const coupon = await formCouponForItem(item.id, actorId);
  await issueCouponIfReady(coupon.id, actorId);

  await db.coinRedemption.update({
    where: { id: redemptionId },
    data: { couponId: coupon.id, status: "FULFILLED" },
  });
}

/** Покупка карточки за монеты. INSTANT — сразу выдаёт купон. REQUEST — эскроу, ждёт C&B. */
export async function redeemWithCoins(params: {
  employeeId: string;
  benefitCardId: string;
  actorId: string;
}): Promise<{ redemptionId: string; status: "FULFILLED" | "PENDING" }> {
  const card = await db.benefitCard.findUniqueOrThrow({
    where: { id: params.benefitCardId },
    include: { partner: { select: { deliveryMode: true } } },
  });
  if (!card.coinPrice || !card.coinRedemptionMode) {
    throw new CoinRedemptionError("Эта карточка не продаётся за монеты.");
  }
  if (card.minParticipants > 1) {
    throw new CoinRedemptionError("Групповые льготы нельзя купить за монеты.");
  }
  if (card.partner?.deliveryMode === "PHONE_PROMO") {
    throw new CoinRedemptionError("Эта льгота выдаётся по номеру телефона, купон не формируется.");
  }

  const redemption = await db.coinRedemption.create({
    data: {
      employeeId: params.employeeId,
      benefitCardId: params.benefitCardId,
      coinCost: card.coinPrice,
      mode: card.coinRedemptionMode,
      status: "PENDING",
    },
  });

  try {
    await spendCoins({
      employeeId: params.employeeId,
      amount: card.coinPrice,
      reason: `Покупка «${card.title}»`,
      opKey: `redemption:${redemption.id}`,
      redemptionId: redemption.id,
    });
  } catch (e) {
    await db.coinRedemption.delete({ where: { id: redemption.id } });
    if (e instanceof CoinWalletError) throw new CoinRedemptionError(e.message);
    throw e;
  }

  if (card.coinRedemptionMode === "INSTANT") {
    await fulfillRedemption(redemption.id, params.actorId);
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_FULFILLED", entityType: "CoinRedemption", entityId: redemption.id });
    return { redemptionId: redemption.id, status: "FULFILLED" };
  }

  await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_REQUESTED", entityType: "CoinRedemption", entityId: redemption.id });
  return { redemptionId: redemption.id, status: "PENDING" };
}

/** Решение C&B по заявке REQUEST-режима: одобрить (выдать купон) или отклонить (вернуть монеты). */
export async function decideCoinRedemption(params: {
  redemptionId: string;
  decision: "APPROVE" | "REJECT";
  actorId: string;
}): Promise<void> {
  const redemption = await db.coinRedemption.findUniqueOrThrow({ where: { id: params.redemptionId } });
  if (redemption.status !== "PENDING") throw new CoinRedemptionError("Заявка уже обработана.");

  if (params.decision === "APPROVE") {
    await fulfillRedemption(redemption.id, params.actorId);
    await db.coinRedemption.update({
      where: { id: redemption.id },
      data: { decidedById: params.actorId, decidedAt: new Date() },
    });
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_APPROVED", entityType: "CoinRedemption", entityId: redemption.id });
  } else {
    await reverseSpend({ opKey: `redemption:${redemption.id}`, reason: "Заявка на покупку за монеты отклонена" });
    await db.coinRedemption.update({
      where: { id: redemption.id },
      data: { status: "REJECTED", decidedById: params.actorId, decidedAt: new Date() },
    });
    await audit({ actorId: params.actorId, action: "COIN_REDEMPTION_REJECTED", entityType: "CoinRedemption", entityId: redemption.id });
  }
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`

Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/lib/coin-redemption.ts
git commit -m "feat(gamification): покупка купона за монеты (INSTANT/REQUEST)"
```

---

## Task 6: Библиотека задач геймификации

**Files:**
- Create: `src/lib/gamification-tasks.ts`

**Interfaces:**
- Consumes: `creditCoins` из `@/lib/coin-wallet`; `redeemWithCoins` из `@/lib/coin-redemption`.
- Produces:
  - `class GamificationTaskError extends Error`
  - `listAvailableTasksForEmployee(employeeId: string): Promise<GamificationTask[]>` — активные задачи, доступные по `scope`, которые сотрудник ещё не взял.
  - `listEmployeeTasks(employeeId: string)` — задачи сотрудника с данными шаблона.
  - `joinTask(params: { employeeId: string; taskId: string; prizeCardId?: string | null }): Promise<void>`
  - `completeEmployeeTaskManual(params: { employeeTaskId: string; actorId: string }): Promise<void>`
  - `recomputeAutoTasks(): Promise<{ checked: number; completed: number }>`

- [ ] **Step 1: Написать `src/lib/gamification-tasks.ts`**

```typescript
import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { creditCoins } from "@/lib/coin-wallet";
import { redeemWithCoins } from "@/lib/coin-redemption";
import type { GamificationAutoMetric } from "@prisma/client";

export class GamificationTaskError extends Error {}

function scopeWhere(employee: { id: string; department: string }) {
  return {
    isActive: true,
    OR: [
      { scope: "ALL" as const },
      { scope: "DEPARTMENT" as const, department: employee.department },
      { scope: "SPECIFIC" as const, employeeIds: { has: employee.id } },
    ],
  };
}

/** Активные задачи, доступные сотруднику по scope, которые он ещё не взял. */
export async function listAvailableTasksForEmployee(employeeId: string) {
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, department: true } });
  const now = new Date();
  return db.gamificationTask.findMany({
    where: {
      ...scopeWhere(employee),
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      employeeTasks: { none: { employeeId } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Задачи, которые сотрудник уже взял (в работе или завершённые), с данными шаблона. */
export function listEmployeeTasks(employeeId: string) {
  return db.employeeTask.findMany({
    where: { employeeId },
    include: { task: true },
    orderBy: { joinedAt: "desc" },
  });
}

export async function joinTask(params: { employeeId: string; taskId: string; prizeCardId?: string | null }): Promise<void> {
  const task = await db.gamificationTask.findUnique({ where: { id: params.taskId } });
  if (!task || !task.isActive) throw new GamificationTaskError("Задача недоступна.");
  if (params.prizeCardId) {
    const card = await db.benefitCard.findUnique({ where: { id: params.prizeCardId }, select: { coinPrice: true } });
    if (!card?.coinPrice) throw new GamificationTaskError("Выбранный приз не продаётся за монеты.");
  }
  const existing = await db.employeeTask.findUnique({
    where: { employeeId_taskId: { employeeId: params.employeeId, taskId: params.taskId } },
  });
  if (existing) throw new GamificationTaskError("Вы уже взяли эту задачу.");

  await db.employeeTask.create({
    data: { employeeId: params.employeeId, taskId: params.taskId, prizeCardId: params.prizeCardId ?? null },
  });
}

/** Начисляет монеты за завершённую задачу; если выбран приз заранее — сразу тратит их на него. */
async function rewardCompletedTask(employeeTaskId: string, actorId: string): Promise<void> {
  const et = await db.employeeTask.findUniqueOrThrow({ where: { id: employeeTaskId }, include: { task: true } });
  await creditCoins({
    employeeId: et.employeeId,
    amount: et.task.coinReward,
    reason: `Задача «${et.task.title}» выполнена`,
    opKey: `task-reward:${et.id}`,
    taskId: et.taskId,
  });
  if (et.prizeCardId) {
    await redeemWithCoins({ employeeId: et.employeeId, benefitCardId: et.prizeCardId, actorId });
  }
}

/** C&B вручную отмечает задачу выполненной (verification = MANUAL). */
export async function completeEmployeeTaskManual(params: { employeeTaskId: string; actorId: string }): Promise<void> {
  const et = await db.employeeTask.findUniqueOrThrow({ where: { id: params.employeeTaskId }, include: { task: true } });
  if (et.status !== "IN_PROGRESS") throw new GamificationTaskError("Задача уже закрыта.");
  if (et.task.verification !== "MANUAL") throw new GamificationTaskError("Эта задача проверяется автоматически.");

  await db.employeeTask.update({
    where: { id: et.id },
    data: { status: "COMPLETED", completedAt: new Date(), confirmedById: params.actorId },
  });
  await rewardCompletedTask(et.id, params.actorId);
  await audit({ actorId: params.actorId, action: "GAMIFICATION_TASK_COMPLETED", entityType: "EmployeeTask", entityId: et.id });
}

async function computeAutoProgress(metric: GamificationAutoMetric, employeeId: string, since: Date): Promise<number> {
  switch (metric) {
    case "APPLICATIONS_SUBMITTED":
      return db.applicationItem.count({
        where: { application: { is: { employeeId } }, status: { not: "DRAFT" }, createdAt: { gte: since } },
      });
    case "COUPONS_USED":
      return db.coupon.count({ where: { employeeId, status: "USED", updatedAt: { gte: since } } });
    case "FEEDBACK_GIVEN":
      return db.satisfactionResponse.count({ where: { employeeId, createdAt: { gte: since } } });
  }
}

/** Пересчёт прогресса всех AUTO-задач в работе. Вызывается cron-роутом раз в сутки. */
export async function recomputeAutoTasks(): Promise<{ checked: number; completed: number }> {
  const inProgress = await db.employeeTask.findMany({
    where: { status: "IN_PROGRESS", task: { is: { verification: "AUTO" } } },
    include: { task: true },
  });

  let completed = 0;
  for (const et of inProgress) {
    if (!et.task.autoMetric || et.task.targetValue == null) continue;
    const progressValue = await computeAutoProgress(et.task.autoMetric, et.employeeId, et.joinedAt);
    const reachedTarget = progressValue >= et.task.targetValue;
    await db.employeeTask.update({
      where: { id: et.id },
      data: {
        progressValue,
        ...(reachedTarget ? { status: "COMPLETED", completedAt: new Date() } : {}),
      },
    });
    if (reachedTarget) {
      completed += 1;
      await rewardCompletedTask(et.id, "cron:gamification-tasks");
      await audit({ actorId: null, action: "GAMIFICATION_TASK_COMPLETED", entityType: "EmployeeTask", entityId: et.id, newValue: { auto: true } });
    }
  }
  return { checked: inProgress.length, completed };
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`

Expected: 0 ошибок. Если `audit({ actorId: null, ... })` не проходит по типам — проверить сигнатуру `audit` в [src/lib/audit.ts](../../../src/lib/audit.ts) (там `actorId?: string | null`, должно быть ок).

- [ ] **Step 3: Commit**

```bash
git add src/lib/gamification-tasks.ts
git commit -m "feat(gamification): библиотека задач — взять в работу, ручное/авто завершение"
```

---

## Task 7: Cron-роут для авто-задач

**Files:**
- Create: `src/app/api/cron/gamification-tasks/route.ts`
- Modify: `docs/CRON-SETUP.md`

**Interfaces:**
- Consumes: `recomputeAutoTasks` из `@/lib/gamification-tasks`; `safeEqual` из `@/lib/timing-safe`.

- [ ] **Step 1: Написать роут**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { recomputeAutoTasks } from "@/lib/gamification-tasks";
import { safeEqual } from "@/lib/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ежесуточный пересчёт прогресса AUTO-задач геймификации. Расписание — во
 * внешнем планировщике (cron-job.org), не в vercel.json (см. docs/CRON-SETUP.md,
 * Hobby-тариф ограничен 2 задачами раз в сутки).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await recomputeAutoTasks();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/gamification-tasks]", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Задокументировать в CRON-SETUP.md**

В [docs/CRON-SETUP.md](../../CRON-SETUP.md) добавить строку в таблицу (после строки `daily-digest`):

```markdown
| `/api/cron/gamification-tasks` | раз в сутки | пересчёт прогресса AUTO-задач геймификации, начисление монет при достижении цели (§Farovon Coins) |
```

и в раздел «Что нужно сделать» → п.3 «Проверка после деплоя» добавить строку с `curl` по образцу двух существующих.

- [ ] **Step 3: Проверить типы**

Run: `npx tsc --noEmit`

Expected: 0 ошибок.

- [ ] **Step 4: Ручная проверка локально**

Запустить dev-сервер (`npm run dev`), затем:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/gamification-tasks
```

Expected: `{"ok":true,"checked":0,"completed":0}` (пока нет задач — появятся после Task 8/9).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/cron/gamification-tasks" docs/CRON-SETUP.md
git commit -m "feat(gamification): cron-роут пересчёта авто-задач"
```

---

## Task 8: Админка `/admin/gamification` — задачи и заявки на покупку

**Files:**
- Create: `src/app/(admin)/admin/gamification/actions.ts`
- Create: `src/app/(admin)/admin/gamification/page.tsx`
- Create: `src/app/(admin)/admin/gamification/_task-form.tsx`
- Modify: `src/app/(app)/_nav.ts` (пункт админ-меню)
- Modify: `src/lib/i18n/dict.ts` (ключи `gamificationAdmin.*`)

**Interfaces:**
- Consumes: `joinTask`/`completeEmployeeTaskManual` не нужны здесь (взятие задачи — действие сотрудника); использует `db.gamificationTask.create/update`, `completeEmployeeTaskManual` из `@/lib/gamification-tasks`, `decideCoinRedemption` из `@/lib/coin-redemption`.
- Produces: server actions `createGamificationTask`, `toggleTaskActive(taskId, isActive)`, `completeTaskManually(employeeTaskId)`, `decideRedemption(redemptionId, decision)`.

- [ ] **Step 1: Написать `actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import type { GamificationAutoMetric, GamificationVerification, TaskScope } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { completeEmployeeTaskManual, GamificationTaskError } from "@/lib/gamification-tasks";
import { decideCoinRedemption, CoinRedemptionError } from "@/lib/coin-redemption";

export type TaskFormState = { error?: string };

const VERIFICATIONS: GamificationVerification[] = ["MANUAL", "AUTO"];
const METRICS: GamificationAutoMetric[] = ["APPLICATIONS_SUBMITTED", "COUPONS_USED", "FEEDBACK_GIVEN"];
const SCOPES: TaskScope[] = ["ALL", "DEPARTMENT", "SPECIFIC"];

export async function createGamificationTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const s = await requireSession();
  assertCan(s.roles, "gamification.manage");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title || !description) return { error: "Укажите название и описание задачи." };

  const coinReward = Number.parseInt(String(formData.get("coinReward") ?? ""), 10);
  if (!Number.isSafeInteger(coinReward) || coinReward <= 0) return { error: "Награда в монетах должна быть положительным целым числом." };

  const verificationRaw = String(formData.get("verification") ?? "MANUAL");
  if (!VERIFICATIONS.includes(verificationRaw as GamificationVerification)) return { error: "Некорректный тип проверки." };
  const verification = verificationRaw as GamificationVerification;

  let autoMetric: GamificationAutoMetric | null = null;
  let targetValue: number | null = null;
  if (verification === "AUTO") {
    const metricRaw = String(formData.get("autoMetric") ?? "");
    if (!METRICS.includes(metricRaw as GamificationAutoMetric)) return { error: "Выберите метрику для авто-проверки." };
    autoMetric = metricRaw as GamificationAutoMetric;
    targetValue = Number.parseInt(String(formData.get("targetValue") ?? ""), 10);
    if (!Number.isSafeInteger(targetValue) || targetValue <= 0) return { error: "Укажите порог (целое число больше 0)." };
  }

  const scopeRaw = String(formData.get("scope") ?? "ALL");
  if (!SCOPES.includes(scopeRaw as TaskScope)) return { error: "Некорректная область действия." };
  const scope = scopeRaw as TaskScope;
  const department = scope === "DEPARTMENT" ? String(formData.get("department") ?? "").trim() || null : null;
  if (scope === "DEPARTMENT" && !department) return { error: "Укажите подразделение." };

  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

  const task = await db.gamificationTask.create({
    data: {
      title,
      description,
      coinReward,
      verification,
      autoMetric,
      targetValue,
      scope,
      department,
      endsAt,
      createdById: s.user.id,
    },
  });
  await audit({ actorId: s.user.id, action: "GAMIFICATION_TASK_CREATED", entityType: "GamificationTask", entityId: task.id, newValue: { title } });
  revalidatePath("/admin/gamification");
  return {};
}

export async function toggleTaskActive(taskId: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    await db.gamificationTask.update({ where: { id: taskId }, data: { isActive } });
    await audit({ actorId: s.user.id, action: isActive ? "GAMIFICATION_TASK_ACTIVATED" : "GAMIFICATION_TASK_DEACTIVATED", entityType: "GamificationTask", entityId: taskId });
    revalidatePath("/admin/gamification");
  });
}

export async function completeTaskManually(employeeTaskId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    try {
      await completeEmployeeTaskManual({ employeeTaskId, actorId: s.user.id });
    } catch (e) {
      if (e instanceof GamificationTaskError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/admin/gamification");
  });
}

export async function decideRedemption(redemptionId: string, decision: "APPROVE" | "REJECT"): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "gamification.manage");
    try {
      await decideCoinRedemption({ redemptionId, decision, actorId: s.user.id });
    } catch (e) {
      if (e instanceof CoinRedemptionError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/admin/gamification");
  });
}
```

- [ ] **Step 2: Написать форму создания задачи `_task-form.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { TaskFormState } from "./actions";

export function TaskForm({ action }: { action: (s: TaskFormState, fd: FormData) => Promise<TaskFormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [verification, setVerification] = useState("MANUAL");
  const [scope, setScope] = useState("ALL");

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Название" htmlFor="title" required>
        <Input id="title" name="title" required />
      </Field>
      <Field label="Описание" htmlFor="description" required>
        <Textarea id="description" name="description" rows={2} required />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Награда, Farovon Coin" htmlFor="coinReward" required>
          <Input id="coinReward" name="coinReward" type="number" min={1} required />
        </Field>
        <Field label="Проверка" htmlFor="verification">
          <Select id="verification" name="verification" value={verification} onChange={(e) => setVerification(e.target.value)}>
            <option value="MANUAL">Вручную (C&B отмечает)</option>
            <option value="AUTO">Автоматически</option>
          </Select>
        </Field>
      </div>
      {verification === "AUTO" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Метрика" htmlFor="autoMetric">
            <Select id="autoMetric" name="autoMetric">
              <option value="APPLICATIONS_SUBMITTED">Поданные заявки на льготы</option>
              <option value="COUPONS_USED">Погашенные купоны</option>
              <option value="FEEDBACK_GIVEN">Ответы на опрос удовлетворённости</option>
            </Select>
          </Field>
          <Field label="Порог" htmlFor="targetValue" required>
            <Input id="targetValue" name="targetValue" type="number" min={1} required />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Область действия" htmlFor="scope">
          <Select id="scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="ALL">Все сотрудники</option>
            <option value="DEPARTMENT">Подразделение</option>
          </Select>
        </Field>
        {scope === "DEPARTMENT" && (
          <Field label="Подразделение" htmlFor="department" required>
            <Input id="department" name="department" required />
          </Field>
        )}
        <Field label="Окончание (необязательно)" htmlFor="endsAt">
          <Input id="endsAt" name="endsAt" type="date" />
        </Field>
      </div>
      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" loading={pending}>
        Создать задачу
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Написать `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, SectionTitle, Table, type BadgeTone } from "@/components/ui";
import { TaskForm } from "./_task-form";
import { createGamificationTask, toggleTaskActive, completeTaskManually, decideRedemption } from "./actions";

export const dynamic = "force-dynamic";

const REDEMPTION_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "muted",
  FULFILLED: "success",
};

export default async function GamificationAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "gamification.manage")) redirect("/");

  const [tasks, pendingManual, pendingRequests] = await Promise.all([
    db.gamificationTask.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.employeeTask.findMany({
      where: { status: "IN_PROGRESS", task: { is: { verification: "MANUAL" } } },
      include: { employee: { select: { fullName: true, department: true } }, task: { select: { title: true, coinReward: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    db.coinRedemption.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: { fullName: true } }, benefitCard: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div data-wide className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">Геймификация</h1>
      </header>

      <section className="space-y-3">
        <SectionTitle className="text-lg">Новая задача</SectionTitle>
        <Card className="max-w-xl p-4">
          <TaskForm action={createGamificationTask} />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={tasks.length}>Задачи</SectionTitle>
        {tasks.length === 0 ? (
          <EmptyState>Задач пока нет.</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Награда</th>
                  <th>Проверка</th>
                  <th>Область</th>
                  <th>Активна</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="text-ink">{task.title}</td>
                    <td data-numeric>{task.coinReward}</td>
                    <td>{task.verification === "AUTO" ? `Авто · ${task.autoMetric} ≥ ${task.targetValue}` : "Вручную"}</td>
                    <td>{task.scope === "ALL" ? "Все" : task.scope === "DEPARTMENT" ? task.department : "Отдельные"}</td>
                    <td>
                      <form action={toggleTaskActive.bind(null, task.id, !task.isActive)}>
                        <button type="submit" className="text-sm underline">
                          {task.isActive ? "Деактивировать" : "Активировать"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={pendingManual.length}>Ожидают подтверждения (вручную)</SectionTitle>
        {pendingManual.length === 0 ? (
          <EmptyState>Нет задач, ожидающих подтверждения.</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Задача</th>
                  <th>Награда</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingManual.map((et) => (
                  <tr key={et.id}>
                    <td className="text-ink">
                      {et.employee.fullName}
                      <span className="text-ink-subtle"> · {et.employee.department}</span>
                    </td>
                    <td>{et.task.title}</td>
                    <td data-numeric>{et.task.coinReward}</td>
                    <td>
                      <form action={completeTaskManually.bind(null, et.id)}>
                        <button type="submit" className="text-sm font-medium text-primary-strong underline">
                          Подтвердить выполнение
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={pendingRequests.length}>Заявки на покупку за монеты</SectionTitle>
        {pendingRequests.length === 0 ? (
          <EmptyState>Нет заявок, ожидающих решения.</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Льгота</th>
                  <th>Стоимость</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink">{r.employee.fullName}</td>
                    <td>{r.benefitCard.title}</td>
                    <td data-numeric>{r.coinCost}</td>
                    <td>
                      <Badge tone={REDEMPTION_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="space-x-3">
                      <form className="inline" action={decideRedemption.bind(null, r.id, "APPROVE")}>
                        <button type="submit" className="text-sm font-medium text-success underline">
                          Одобрить
                        </button>
                      </form>
                      <form className="inline" action={decideRedemption.bind(null, r.id, "REJECT")}>
                        <button type="submit" className="text-sm font-medium text-danger underline">
                          Отклонить
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Добавить пункт в админ-меню**

В [src/app/(app)/_nav.ts](../../../src/app/(app)/_nav.ts) добавить в `buildNavGroups`, рядом с блоком `satisfaction.manage` (после него), новый пункт:

```typescript
  if (can(roles, "gamification.manage"))
    add("admin", t("nav.adminGroup"), {
      href: "/admin/gamification",
      label: "Геймификация",
      desc: "задачи, монеты, заявки на покупку за монеты",
      icon: ICONS.gamification,
    });
```

(иконка `ICONS.gamification` уже определена в этом файле для сотрудничьего пункта — переиспользуем).

- [ ] **Step 5: Проверить типы и сборку**

Run: `npx tsc --noEmit && npm run build`

Expected: 0 ошибок, сборка проходит (новый роут `/admin/gamification` появляется в выводе `next build`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/admin/gamification" src/app/"(app)"/_nav.ts
git commit -m "feat(gamification): админка — задачи, ручное подтверждение, заявки на покупку"
```

---

## Task 9: Сотруднический `/gamification` — задачи, баланс, магазин

**Files:**
- Create: `src/app/(app)/gamification/_actions.ts`
- Modify: `src/app/(app)/gamification/page.tsx` (полностью заменить заглушку)
- Modify: `src/app/(app)/_nav.ts` (убрать `soon: true`)
- Modify: `src/lib/i18n/dict.ts` (обновить/добавить ключи `gamification.*`)

**Interfaces:**
- Consumes: `listAvailableTasksForEmployee`, `listEmployeeTasks`, `joinTask` из `@/lib/gamification-tasks`; `getCoinBalance`, `listCoinEntries` из `@/lib/coin-wallet`; `redeemWithCoins` из `@/lib/coin-redemption`.
- Produces: server actions `joinTaskAction(taskId, prizeCardId)`, `buyWithCoinsAction(benefitCardId)`.

- [ ] **Step 1: Написать `_actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action-result";
import { joinTask, GamificationTaskError } from "@/lib/gamification-tasks";
import { redeemWithCoins, CoinRedemptionError } from "@/lib/coin-redemption";

export async function joinTaskAction(taskId: string, prizeCardId: string | null): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    if (!s.employee) throw new Error("Доступно только сотрудникам.");
    try {
      await joinTask({ employeeId: s.employee.id, taskId, prizeCardId });
    } catch (e) {
      if (e instanceof GamificationTaskError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/gamification");
  });
}

export async function buyWithCoinsAction(benefitCardId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    if (!s.employee) throw new Error("Доступно только сотрудникам.");
    try {
      await redeemWithCoins({ employeeId: s.employee.id, benefitCardId, actorId: s.user.id });
    } catch (e) {
      if (e instanceof CoinRedemptionError) throw new Error(e.message);
      throw e;
    }
    revalidatePath("/gamification");
  });
}
```

- [ ] **Step 2: Переписать `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n";
import { Badge, Card, EmptyState, SectionTitle, Table } from "@/components/ui";
import { listAvailableTasksForEmployee, listEmployeeTasks } from "@/lib/gamification-tasks";
import { getCoinBalance, listCoinEntries } from "@/lib/coin-wallet";
import { joinTaskAction, buyWithCoinsAction } from "./_actions";

export const dynamic = "force-dynamic";

export default async function GamificationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");
  const t = await getTranslator();
  const employeeId = session.employee.id;

  const [available, mine, balance, entries, shopCards] = await Promise.all([
    listAvailableTasksForEmployee(employeeId),
    listEmployeeTasks(employeeId),
    getCoinBalance(employeeId),
    listCoinEntries(employeeId, 10),
    db.benefitCard.findMany({
      where: { coinPrice: { not: null }, isActive: true, status: "PUBLISHED", archivedAt: null },
      orderBy: { coinPrice: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.5625rem]">{t("gamification.title")}</h1>
        <div className="rounded-full bg-primary-soft px-4 py-1.5 text-sm font-bold text-primary-strong">
          {balance} {t("gamification.coinUnit")}
        </div>
      </header>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={available.length}>{t("gamification.availableTasks")}</SectionTitle>
        {available.length === 0 ? (
          <EmptyState>{t("gamification.noAvailableTasks")}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {available.map((task) => (
              <Card key={task.id} className="space-y-2 p-4">
                <p className="font-semibold text-ink">{task.title}</p>
                <p className="text-sm text-ink-muted">{task.description}</p>
                <p className="text-sm font-medium text-primary-strong">
                  +{task.coinReward} {t("gamification.coinUnit")}
                </p>
                <form action={joinTaskAction.bind(null, task.id, null)}>
                  <button type="submit" className="text-sm font-medium text-primary-strong underline">
                    {t("gamification.joinTask")}
                  </button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={mine.length}>{t("gamification.myTasks")}</SectionTitle>
        {mine.length === 0 ? (
          <EmptyState>{t("gamification.noMyTasks")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamification.colTask")}</th>
                  <th>{t("gamification.colStatus")}</th>
                  <th>{t("gamification.colProgress")}</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((et) => (
                  <tr key={et.id}>
                    <td className="text-ink">{et.task.title}</td>
                    <td>
                      <Badge tone={et.status === "COMPLETED" ? "success" : "neutral"}>{et.status}</Badge>
                    </td>
                    <td data-numeric>
                      {et.task.verification === "AUTO" && et.task.targetValue ? `${et.progressValue} / ${et.task.targetValue}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={shopCards.length}>{t("gamification.shop")}</SectionTitle>
        {shopCards.length === 0 ? (
          <EmptyState>{t("gamification.shopEmpty")}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shopCards.map((card) => (
              <Card key={card.id} className="space-y-2 p-4">
                <p className="font-semibold text-ink">{card.title}</p>
                <p className="text-sm font-medium text-primary-strong">
                  {card.coinPrice} {t("gamification.coinUnit")}
                </p>
                <form action={buyWithCoinsAction.bind(null, card.id)}>
                  <button
                    type="submit"
                    disabled={balance < (card.coinPrice ?? Infinity)}
                    className="text-sm font-medium text-primary-strong underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {card.coinRedemptionMode === "REQUEST" ? t("gamification.buyRequest") : t("gamification.buyInstant")}
                  </button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg">{t("gamification.history")}</SectionTitle>
        {entries.length === 0 ? (
          <EmptyState>{t("gamification.historyEmpty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamification.colWhen")}</th>
                  <th>{t("gamification.colReason")}</th>
                  <th>{t("gamification.colAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="text-ink-muted" data-numeric>
                      {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(e.createdAt)}
                    </td>
                    <td>{e.reason}</td>
                    <td data-numeric className={e.kind === "SPENT" ? "text-danger" : "text-success"}>
                      {e.kind === "SPENT" ? "-" : "+"}
                      {e.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Убрать `soon: true` из навигации**

В [src/app/(app)/_nav.ts](../../../src/app/(app)/_nav.ts), в блоке `add("cabinet", ..., { href: "/gamification", ... })`, удалить строку `soon: true,` и обновить `desc` на `"задачи и монеты Farovon Coin"`.

- [ ] **Step 4: Обновить i18n-ключи**

В [src/lib/i18n/dict.ts](../../../src/lib/i18n/dict.ts) заменить существующий блок `gamification.*` (4 ключа-заглушки: `title`, `soon`, `wip`, `wipText`) на полный набор в каждом из 3 языковых блоков (`ru`, `tg`, `uz`). Для `ru`:

```typescript
    "gamification.title": "Геймификация",
    "gamification.coinUnit": "Farovon Coin",
    "gamification.availableTasks": "Доступные задачи",
    "gamification.noAvailableTasks": "Сейчас нет доступных задач.",
    "gamification.joinTask": "Взять в работу",
    "gamification.myTasks": "Мои задачи",
    "gamification.noMyTasks": "Вы ещё не взяли ни одной задачи.",
    "gamification.colTask": "Задача",
    "gamification.colStatus": "Статус",
    "gamification.colProgress": "Прогресс",
    "gamification.shop": "Магазин",
    "gamification.shopEmpty": "Пока нет льгот, доступных за монеты.",
    "gamification.buyInstant": "Купить",
    "gamification.buyRequest": "Отправить заявку",
    "gamification.history": "История операций",
    "gamification.historyEmpty": "Операций пока не было.",
    "gamification.colWhen": "Когда",
    "gamification.colReason": "Операция",
    "gamification.colAmount": "Сумма",
```

Для `tg` (машинный перевод):

```typescript
    "gamification.title": "Бозисозӣ",
    "gamification.coinUnit": "Farovon Coin",
    "gamification.availableTasks": "Вазифаҳои дастрас",
    "gamification.noAvailableTasks": "Ҳоло вазифаи дастрас нест.",
    "gamification.joinTask": "Ба кор гирифтан",
    "gamification.myTasks": "Вазифаҳои ман",
    "gamification.noMyTasks": "Шумо ҳанӯз ягон вазифа нагирифтаед.",
    "gamification.colTask": "Вазифа",
    "gamification.colStatus": "Ҳолат",
    "gamification.colProgress": "Пешравӣ",
    "gamification.shop": "Мағоза",
    "gamification.shopEmpty": "Ҳоло имтиёзи бо тангаҳо дастрас нест.",
    "gamification.buyInstant": "Харидан",
    "gamification.buyRequest": "Дархост фиристодан",
    "gamification.history": "Таърихи амалиётҳо",
    "gamification.historyEmpty": "Ҳанӯз амалиёт набудааст.",
    "gamification.colWhen": "Вақт",
    "gamification.colReason": "Амалиёт",
    "gamification.colAmount": "Маблағ",
```

Для `uz` (машинный перевод):

```typescript
    "gamification.title": "O'yinlashtirish",
    "gamification.coinUnit": "Farovon Coin",
    "gamification.availableTasks": "Mavjud vazifalar",
    "gamification.noAvailableTasks": "Hozircha mavjud vazifa yo'q.",
    "gamification.joinTask": "Ishga olish",
    "gamification.myTasks": "Mening vazifalarim",
    "gamification.noMyTasks": "Siz hali birorta vazifa olmagansiz.",
    "gamification.colTask": "Vazifa",
    "gamification.colStatus": "Holat",
    "gamification.colProgress": "Progress",
    "gamification.shop": "Do'kon",
    "gamification.shopEmpty": "Hozircha tangalarga sotiladigan imtiyoz yo'q.",
    "gamification.buyInstant": "Sotib olish",
    "gamification.buyRequest": "So'rov yuborish",
    "gamification.history": "Amaliyotlar tarixi",
    "gamification.historyEmpty": "Hali amaliyot bo'lmagan.",
    "gamification.colWhen": "Vaqt",
    "gamification.colReason": "Amaliyot",
    "gamification.colAmount": "Miqdor",
```

- [ ] **Step 5: Проверить типы и сборку**

Run: `npx tsc --noEmit && npm run build`

Expected: 0 ошибок, сборка проходит, `/gamification` больше не редиректит и не показывает заглушку «скоро».

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/gamification" src/app/"(app)"/_nav.ts src/lib/i18n/dict.ts
git commit -m "feat(gamification): страница сотрудника — задачи, баланс, магазин, история"
```

---

## Task 10: End-to-end проверка и финальная сборка

**Files:**
- Create: `scripts/gamification-e2e.ts`
- Modify: `package.json` (добавить npm-скрипт)

**Interfaces:**
- Consumes: все библиотеки из Tasks 3, 5, 6 (`coin-wallet`, `coin-redemption`, `gamification-tasks`).

- [ ] **Step 1: Написать e2e-скрипт**

Скрипт повторяет ключевой сценарий по образцу [scripts/flow-e2e.ts](../../../scripts/flow-e2e.ts): работает на уровне библиотек напрямую (не HTTP), проверяет инварианты после каждого шага. Требует существующего в БД сотрудника с логином `ivanov` и хотя бы одной опубликованной FLEX-карточки без партнёра `PHONE_PROMO` и `minParticipants = 1`.

```typescript
/**
 * Сквозной прогон геймификации: задача (ручная) → монеты → покупка за монеты.
 * Запуск: npx tsx scripts/gamification-e2e.ts
 */
import { PrismaClient } from "@prisma/client";
import { joinTask, completeEmployeeTaskManual } from "../src/lib/gamification-tasks";
import { getCoinBalance } from "../src/lib/coin-wallet";
import { redeemWithCoins } from "../src/lib/coin-redemption";

const db = new PrismaClient();

let step = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`  ✗ ПРОВАЛ: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  ok(msg);
}
function head(title: string) {
  console.log(`\n── Шаг ${++step}. ${title} ──`);
}

async function main() {
  head("Предусловия");
  const ivanov = await db.employee.findFirst({ where: { user: { login: "ivanov" } } });
  assert(ivanov, "сотрудник ivanov существует");
  const admin = await db.user.findFirst({ where: { roles: { has: "C_AND_B" } } });
  assert(admin, "есть пользователь C&B");
  const card = await db.benefitCard.findFirst({
    where: { block: "FLEX", status: "PUBLISHED", isActive: true, minParticipants: 1, partner: { deliveryMode: { not: "PHONE_PROMO" } } },
  });
  assert(card, "есть подходящая FLEX-карточка (minParticipants=1, не PHONE_PROMO)");

  head("Создать тестовую задачу (MANUAL)");
  const task = await db.gamificationTask.create({
    data: { title: "E2E тест", description: "тест", coinReward: 100, verification: "MANUAL", createdById: admin!.id },
  });
  ok(`задача создана: ${task.id}`);

  head("ivanov берёт задачу в работу");
  await joinTask({ employeeId: ivanov!.id, taskId: task.id });
  const before = await getCoinBalance(ivanov!.id);
  ok(`баланс до завершения: ${before}`);

  head("C&B подтверждает выполнение → монеты начислены");
  const et = await db.employeeTask.findUniqueOrThrow({ where: { employeeId_taskId: { employeeId: ivanov!.id, taskId: task.id } } });
  await completeEmployeeTaskManual({ employeeTaskId: et.id, actorId: admin!.id });
  const after = await getCoinBalance(ivanov!.id);
  assert(after === before + 100, `баланс увеличился на 100 (было ${before}, стало ${after})`);

  head("Установить цену карточки за монеты и купить INSTANT");
  await db.benefitCard.update({ where: { id: card!.id }, data: { coinPrice: 50, coinRedemptionMode: "INSTANT" } });
  const result = await redeemWithCoins({ employeeId: ivanov!.id, benefitCardId: card!.id, actorId: admin!.id });
  assert(result.status === "FULFILLED", "покупка INSTANT сразу выдала купон");
  const afterBuy = await getCoinBalance(ivanov!.id);
  assert(afterBuy === after - 50, `баланс уменьшился на 50 (было ${after}, стало ${afterBuy})`);

  const redemption = await db.coinRedemption.findUniqueOrThrow({ where: { id: result.redemptionId } });
  assert(!!redemption.couponId, "у заявки на покупку есть привязанный купон");
  const coupon = await db.coupon.findUnique({ where: { id: redemption.couponId! } });
  assert(coupon?.status === "ISSUED", "купон выдан (status = ISSUED)");

  head("Откат тестовых данных");
  await db.coupon.delete({ where: { id: coupon!.id } });
  await db.coinRedemption.delete({ where: { id: redemption.id } });
  await db.applicationItem.deleteMany({ where: { cardId: card!.id, application: { employeeId: ivanov!.id }, coupon: null } });
  await db.coinEntry.deleteMany({ where: { account: { is: { employeeId: ivanov!.id } } } });
  await db.coinAccount.deleteMany({ where: { employeeId: ivanov!.id } });
  await db.employeeTask.delete({ where: { id: et.id } });
  await db.gamificationTask.delete({ where: { id: task.id } });
  await db.benefitCard.update({ where: { id: card!.id }, data: { coinPrice: null, coinRedemptionMode: null } });
  ok("тестовые данные удалены");

  console.log("\n✅ Все проверки пройдены.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
```

- [ ] **Step 2: Добавить npm-скрипт**

В `package.json`, в блок `"scripts"`, добавить (рядом с `"flow:e2e": "tsx scripts/flow-e2e.ts",`):

```json
    "gamification:e2e": "tsx scripts/gamification-e2e.ts",
```

- [ ] **Step 3: Запустить e2e-скрипт против dev-БД**

Run: `npm run gamification:e2e`

Expected: все шаги печатают `✓`, в конце `✅ Все проверки пройдены.`, `process.exitCode` не установлен в 1. Если сотрудника `ivanov` или подходящей карточки нет в dev-БД — создать их вручную перед прогоном (см. `prisma/seed.ts` для примера тестовых данных) либо адаптировать `where`-условия скрипта под реальные данные dev-окружения.

- [ ] **Step 4: Финальная проверка типов и сборки**

Run: `npx tsc --noEmit && npm run build`

Expected: 0 ошибок, сборка Next.js проходит успешно для всех роутов, включая `/gamification`, `/admin/gamification`, `/api/cron/gamification-tasks`.

- [ ] **Step 5: Ручная проверка в браузере**

`npm run dev` → зайти сотрудником: `/gamification` показывает баланс 0, задачи (если созданы через админку), магазин пуст, пока нет карточек с ценой. Зайти C&B: `/admin/gamification` — создать задачу, назначить цену на карточку в `/admin/cards`, вернуться под сотрудником, взять задачу, попросить C&B подтвердить, проверить начисление и покупку в магазине.

- [ ] **Step 6: Commit**

```bash
git add scripts/gamification-e2e.ts package.json
git commit -m "test(gamification): e2e-скрипт полного сценария задача→монеты→покупка"
```

---

## Самопроверка плана

**Покрытие спеки:** модель данных (Task 1), права (Task 2), кошелёк (Task 3), цена/режим на карточке (Task 4, явно по просьбе пользователя), магазин INSTANT/REQUEST (Task 5), задачи MANUAL/AUTO + выбор приза заранее (Task 6), cron для AUTO (Task 7), админка (Task 8), страница сотрудника + убрать «скоро» (Task 9), проверка (Task 10). Бэклог из спеки (лидерборды/бейджи/истечение монет) осознанно не включён — см. §7 спеки.

**Плейсхолдеры:** проверено, нет `TBD`/`TODO`/«добавить обработку ошибок» без кода — все шаги содержат готовый код или точную команду.

**Согласованность типов:** `EmployeeTaskStatus`, `CoinEntryKind`, `CoinRedemptionMode/Status`, `GamificationAutoMetric` определены в Task 1 и используются одинаково во всех последующих задачах; сигнатуры `creditCoins`/`spendCoins`/`reverseSpend` (Task 3) совпадают с вызовами в `coin-redemption.ts` (Task 5) и `gamification-tasks.ts` (Task 6); `redeemWithCoins`/`decideCoinRedemption` (Task 5) совпадают с вызовами в Task 6, 8, 9.
