# Кафетерий льгот «Фаровон»

[![CI](https://github.com/Muzaffarkhon/faravon-cafeteria/actions/workflows/ci.yml/badge.svg)](https://github.com/Muzaffarkhon/faravon-cafeteria/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![status](https://img.shields.io/badge/status-MVP-orange)

Веб-платформа выбора корпоративных льгот: личный кабинет сотрудника + админ-панель.
Стек: Next.js 16 (App Router, TS), Prisma 6 + PostgreSQL, Tailwind 4.

Реализовано:
- Схема БД по всем сущностям ТЗ v2, seed, вход по логину/паролю с сессией (JWT в HttpOnly-cookie),
  RBAC (§4.2), блокировка после 5 неудачных попыток, смена пароля при первом входе, аудит.
- **Авторизация через Telegram-бот с OTP (§5.1):** отдельный процесс `npm run bot` (long polling).
  Идентификация сотрудника по номеру телефона (кнопка «Поделиться контактом») или по коду от HR;
  бот привязывает Telegram и выдаёт одноразовый пароль на 24 часа (`/login` — повторная выдача).
  Экран `/admin/access` (роль `access.manage` = HR BP, суперадмин): выдача кодов идентификации,
  сброс привязки Telegram, статус входа. Просроченный OTP на входе — «Одноразовый код истёк».
- **Сотрудник:** ЛК (данные, период, три блока), выбор 0–4 гибких льгот с лимитом, конечный
  автомат статусов позиции (§5.7), подтверждение и отмена, экран «Мои заявки и купоны».
- **Профиль** (`/profile`, все роли): данные учётной записи + смена пароля с проверкой
  текущего (аудит `PASSWORD_CHANGED` / `PASSWORD_CHANGE_FAILED`). Экран `/change-password`
  остаётся для принудительной смены при первом входе.
- **Согласующий:** очередь `/review` — одобрение / отклонение позиций с обязательной причиной.
- **HR BP:** `/coupons` — формирование купонов по одобренным позициям (уникальный номер
  `FRV-YYYYMM-XXXXXX`, срок действия), выдача, реестр купонов с фильтрами по периоду и
  статусу и экспортом в XLSX (`/coupons/export`, лист «Купоны», §5.8).
- **Контент-менеджер:** `/admin/cards` — CRUD карточек всех трёх блоков (черновик/публикация,
  флаг «скоро», привязка к партнёру, порядок); `/admin/partners` — CRUD справочника партнёров
  (статус активен/скоро/архив, договор, контакты). Удаление блокируется, если есть связанные
  позиции заявок / карточки — предлагается снять с публикации или архивировать.
- **Контент-менеджер:** `/admin/texts` — редактирование блоков «Цель программы» и уведомления
  о новизне (§5.3, §5.6); `/admin/periods` — периоды выбора: создание (черновик), правка,
  открытие/закрытие (одновременно открыт только один период), удаление черновика; валидация
  «окно выбора внутри периода».
- **Аналитик:** `/admin/reports` — дашборд метрик по выбранному периоду (§12): активация,
  вовлечение, льгот на активного сотрудника, конверсия заявка→купон, доля отклонений,
  среднее и p90 времени до решения и до выдачи купона, доля нарушений SLA согласования;
  топ льгот по выборам и одобрениям, отклонения по причинам, выборы по подразделениям;
  **экспорт в XLSX** (`exceljs`) — одна книга с листами «Метрики», «Топ льгот», «Отклонения»,
  «Подразделения» через `/admin/reports/export?period=<id>`. Доступ — `reports.view`.
- Уведомления сотруднику (`Notification`) на каждой смене статуса — §5.10 (канал Telegram,
  доставка появится вместе с ботом).

## Запуск

```bash
cp .env.example .env      # проверьте DATABASE_URL / SHADOW_DATABASE_URL / AUTH_SECRET
docker compose up -d      # PostgreSQL на localhost:5433
npm install
npx prisma migrate deploy # применить миграции (или: prisma migrate dev для разработки)
npm run db:seed
npm run dev               # http://localhost:3000 (или 3001, если 3000 занят)
# если процесс отваливается в фоне — запускать напрямую:
# node node_modules/next/dist/bin/next dev -p 3001
```

Демо-учётки (пароль `Password1`): `superadmin`, `content`, `approver`, `hrbp`, `analyst`,
`ivanov`, `petrova`, `sidorov`.

### Примечания по окружению

- **Shadow database.** В `datasource` задан `shadowDatabaseUrl` (`faravon_shadow`) — Prisma
  создаёт и удаляет её сама при `migrate dev`. Пользователю БД нужны права на `CREATEDB`
  (у `faravon` они есть).
- **Turbopack root.** `next.config.ts` фиксирует `turbopack.root` на каталог проекта — иначе
  сторонний lock-файл в домашней папке сбивает определение корня и ломает резолвинг маршрутов
  (`/api/*` начинает отдавать 404).
- **Docker Desktop / инференс-менеджер.** Если Docker Desktop падает на старте с ошибкой
  `initializing Inference manager`, отключите Docker AI: в `%APPDATA%\Docker\settings-store.json`
  выставьте `"EnableDockerAI": false` и удалите каталог `%LOCALAPPDATA%\Docker\run`, затем
  перезапустите Docker Desktop.

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run dev` | dev-сервер |
| `npm run bot` | Telegram-бот авторизации (нужен `TELEGRAM_BOT_TOKEN` в `.env`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | наполнение справочников и учёток |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | пересоздать БД + seed |

## Структура

```
prisma/schema.prisma          сущности ТЗ v2 (Employee, User+роли, Partner, BenefitCard,
                              Period, Application/ApplicationItem, Coupon, TextBlock,
                              Notification, AuditLog)
prisma/seed.ts                партнёры, 11 гибких льгот, программы признания, витрина заботы,
                              открытый период, 8 учёток
src/lib/auth.ts               сессия (jose JWT + cookie), getSession/requireSession
src/lib/rbac.ts               PERMISSIONS-матрица, can()/assertCan(), ROLE_LABELS
src/lib/application-workflow.ts  статусы позиции + таблица переходов (§5.7)
src/lib/selection.ts          текущий период, заявка, подсчёт лимита
src/middleware.ts             защита маршрутов
src/app/login, /change-password  вход и смена пароля
src/app/(app)/                ЛК: layout + page + actions (toggle/submit/cancel/logout)
src/app/(app)/applications/   «Мои заявки и купоны»
src/app/api/health/           проверка соединения с БД
```

## CI

`.github/workflows/ci.yml` (push в `main` + pull request), поднимает Postgres-сервис:

1. `npm run lint` — ESLint
2. `npm run typecheck` — `tsc --noEmit`
3. `prisma migrate deploy` — миграции применяются к чистой БД без ошибок
4. `prisma migrate diff … --exit-code` — миграции полностью описывают `schema.prisma` (нет дрейфа: изменил схему — добавь миграцию)

### Pre-push хук

`.githooks/pre-push` + `core.hooksPath=.githooks` (ставится автоматически через `npm`-скрипт
`prepare` при `npm install`). Перед push в `main` локально гоняет `lint` + `typecheck` и
отменяет push при ошибке. Обход в экстренном случае — `git push --no-verify`.

> Настоящей защиты ветки на GitHub (блокировка merge до зелёного CI) нет: для приватного
> репозитория она требует GitHub Pro. При переходе на Pro или публикации репозитория
> включается ruleset одной командой.

## Развёртывание (production)

**Требования:** Node 20+, PostgreSQL 14+ (управляемый или свой), публичный HTTPS-домен.

### Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | строка подключения к боевой БД |
| `AUTH_SECRET` | ключ подписи сессий — **32+ случайных байта**, не из `.env.example` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `PLATFORM_URL` | публичный URL платформы (используется в сообщениях бота) |
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather (без него бот не стартует, вход по паролю работает) |
| `TELEGRAM_WEBHOOK_SECRET` | секрет webhook-режима (Vercel) — проверяется роутом `/api/telegram` |
| `CRON_SECRET` | секрет крон-доставки уведомлений — проверяется `/api/cron/deliver-notifications` (см. «Доставка уведомлений») |
| `NODE_ENV=production` | включает `Secure` для cookie сессии |
| `SHADOW_DATABASE_URL` | **только для разработки** (`migrate dev`); в проде не нужен |

### Сборка и запуск (без Docker)

```bash
npm ci
npx prisma generate
npx prisma migrate deploy      # применить миграции; НИКОГДА не migrate dev / db push в проде
npm run build
npm run start                  # next start на :3000, за reverse-proxy с TLS
npm run db:seed                # один раз при первом развёртывании (создаёт справочники и учётки)
```

`GET /api/health` → `{"ok":true}` — проба liveness/readiness.

### Docker

`Dockerfile` — multi-stage, `output: "standalone"`. Контейнер при старте сам выполняет
`prisma migrate deploy`, затем поднимает сервер.

```bash
docker build -t faravon-cafeteria .
docker run -p 3000:3000 --env-file .env faravon-cafeteria
```

`docker-compose.yml` в репозитории поднимает только PostgreSQL для локальной разработки;
для прод-стека добавьте сервис приложения из образа выше.

### Vercel

`build` = `prisma generate && next build` (Vercel не запускает postinstall Prisma сам).

1. Vercel → **Add New… → Project → Import** `Muzaffarkhon/faravon-cafeteria`
   (авторизовать GitHub-app для приватного репо).
2. Framework — Next.js (определяется автоматически), Build/Output — по умолчанию.
3. **Environment Variables** (Production и Preview): `DATABASE_URL` (pooled-URL Neon —
   `...-pooler.<region>.aws.neon.tech/...?sslmode=require`), `AUTH_SECRET` (32+ байт),
   `PLATFORM_URL` (`https://<project>.vercel.app`), `TELEGRAM_BOT_TOKEN` +
   `TELEGRAM_WEBHOOK_SECRET` (для webhook-бота). `NODE_ENV` Vercel ставит сам.
4. Deploy.
5. **Миграции** один раз после первого деплоя — локально с боевым URL:
   `DATABASE_URL="<prod-url>" npx prisma migrate deploy` (в build их не кладём).
   Затем один раз `DATABASE_URL="<prod-url>" npm run db:seed` — начальные справочники и
   учётка суперадмина (пароль сменить сразу).

Managed Postgres: любой (Neon / Vercel Postgres / Supabase) — важен **пул соединений**
(serverless-функции + прямой Postgres = исчерпание коннектов); используйте pooled-строку
(`?pgbouncer=true` / отдельный pooler-хост).

### Telegram-бот

Два режима, одна логика идентификации:

- **Webhook** (`src/app/api/telegram/route.ts`) — для Vercel. Telegram шлёт апдейты POST-ом;
  роут проверяет заголовок `X-Telegram-Bot-Api-Secret-Token` против `TELEGRAM_WEBHOOK_SECRET`.
  Регистрация после деплоя:
  ```bash
  PLATFORM_URL=https://<project>.vercel.app \
  TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
  npm run webhook            # npm run webhook delete — вернуться на polling; ... info — статус
  ```
  Env на Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PLATFORM_URL`.

- **Long polling** (`npm run bot`, `bot/bot.ts`) — для локальной разработки и не-serverless
  хостинга (pm2 / systemd / отдельный контейнер).

Логика привязки и выдачи OTP: `src/lib/telegram-link.ts` (webhook) и `bot/link.ts`
(самодостаточный аналог для polling).

### Доставка уведомлений (§5.10)

Уведомления пишутся в таблицу `Notification` синхронно при смене статуса. Отправку в
Telegram выполняет `deliverTelegramNotifications` (`src/lib/notification-delivery.ts`)
в три уровня:

1. **Inline** — `notifyEmployee`/`notifyApprovers` через `after()` (`next/server`) пытаются
   доставить сразу после ответа пользователю, не блокируя server action. Обычный путь,
   ~1–2 c до Telegram.
2. **Cron** — GET-роут `/api/cron/deliver-notifications` (защита `CRON_SECRET`,
   заголовок `Authorization: Bearer $CRON_SECRET`) подбирает то, что не ушло inline
   (Telegram лежал, функция не догрелась, получатель привязал бота позже).
3. **`npm run bot`** — тот же подбор для не-serverless хостинга (цикл каждые 15 c).

Планировщик для cron-уровня (только подстраховка — основную работу делает inline):

| Способ | Интервал | Настройка |
|--------|----------|-----------|
| **cron-job.org** (основной, бесплатно) | 1 мин | новая Cronjob: URL `https://<домен>/api/cron/deliver-notifications`, метод GET, заголовок `Authorization: Bearer <CRON_SECRET>` |
| **Vercel Cron** (`vercel.json`, запасной) | 1 час на Hobby (`0 * * * *`); можно `* * * * *` на Pro | ничего, подхватывается при деплое |

Счётчик «Согласование» и список `/review` в самом приложении обновляются мгновенно и от
планировщика не зависят — задержка касается только Telegram-сообщений.

Env на Vercel: добавить `CRON_SECRET`
(`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).

Проверка: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<домен>/api/cron/deliver-notifications`
→ `{"ok":true,"delivered":N,...}`.

### Чек-лист безопасности

- `AUTH_SECRET` — сильный, уникальный для окружения; `.env` не в git (уже так).
- PostgreSQL недоступен из интернета; пользователь БД без superuser-прав.
- Только HTTPS; корректный `PLATFORM_URL`.
- После первого входа сменить пароль `superadmin`; в проде не сидировать демо-учётки сотрудников.
- Регулярные бэкапы БД; хранение журнала `AuditLog` согласно политике (§9).
- Обновлять миграции только через `prisma migrate deploy`.
- `npm audit` — чисто (транзитивные `uuid` / `deepmerge-ts` подтянуты через `overrides` в `package.json`).

## Дальнейшие итерации

Загрузка изображений карточек в объектное хранилище, доставка уведомлений в Telegram
(модель `Notification` уже пишется), редактируемые шаблоны уведомлений и матрица SLA-эскалаций,
история версий карточек, 2FA для админ-ролей, CI (lint + typecheck + `prisma migrate diff`).
Открытые вопросы — Приложение А ТЗ v2.
