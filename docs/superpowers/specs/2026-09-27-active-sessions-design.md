# Активные сессии («Кто онлайн») — дизайн

**Дата:** 27 сентября 2026 г.
**Статус:** утверждено в чате, готово к реализации.

## Зачем

C&B хочет видеть, кто из сотрудников сейчас на сайте в реальном времени: с
какого устройства (телефон/ноутбук), из какого города/страны, список
одновременно активных устройств одного человека — а не просто «онлайн/офлайн».

## Текущее состояние (почему это архитектурная правка)

Сессия сейчас — самодостаточный JWT в httpOnly-куке (`faravon_session`,
`src/lib/auth.ts`). Сервер не хранит список выданных сессий вообще: подпись
токена проверяется без обращения к БД (`readToken`), а `getSession()` делает
только `db.user.findUnique` для проверки `isActive`/`sessionEpoch`. Отозвать
конкретное устройство или узнать, сколько у сотрудника открытых сессий,
невозможно в принципе — нужна новая постоянная сущность.

**Важное ограничение среды:** локальная разработка и прод делят одну и ту же
БД (Supabase, `connection_limit=1` в pooled-строке подключения). Один
исчерпанный slot соединения кладёt логин для всех — это уже проявлялось в
сессии 27 сентября. Любая новая запись в БД на каждый запрос страницы —
неприемлема без троттлинга.

## Схема данных

Новая модель в `prisma/schema.prisma`:

```prisma
model UserSession {
  id         String    @id // = sid, зашитый в JWT (crypto.randomUUID())
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId     String
  device     String    // "mobile" | "desktop" | "unknown" — грубый разбор UA
  browser    String?   // "Chrome" | "Safari" | "Firefox" | "Edge" | null
  ip         String?
  city       String?   // best-effort geo-IP, может быть null
  country    String?
  createdAt  DateTime  @default(now())
  lastSeenAt DateTime  @default(now())
  revokedAt  DateTime? // явный выход (destroySession) или сброс sessionEpoch

  @@index([userId])
  @@index([lastSeenAt])
}
```

Онлайн = `revokedAt IS NULL AND lastSeenAt > now() - 3 минуты`. Строки не
удаляются автоматически (как и `LoginAttempt`/`AuditLog` — ручная чистка при
необходимости, не в рамках этой задачи).

## Жизненный цикл сессии

### `createSession(payload)` (`src/lib/auth.ts`)

1. Читает **текущую** куку через уже существующий `readToken()` (до
   перезаписи).
2. Если валидный токен есть и `existingToken.sub === payload.sub` —
   переиспользует его `sid` из payload. Новая строка `UserSession` **не**
   создаётся. Это критично: `createSession` вызывается не только при логине,
   но и при смене пароля/профиля (`profile/actions.ts`,
   `change-password/actions.ts`) — без этой проверки каждая такая операция
   плодила бы фиктивное «новое устройство».
3. Иначе (нет токена, невалиден, либо `sub` другого пользователя — например,
   переиспользуемый терминал подрядчика) — генерирует новый `sid`
   (`crypto.randomUUID()`) и создаёт строку `UserSession`:
   - `device`/`browser` — разбор `User-Agent` через новую чистую функцию
     `parseUserAgent()` (без внешней зависимости, простые regex).
   - `ip` — из уже существующего `clientMeta()` (`src/lib/client-meta.ts`,
     тот же хелпer, что и `LoginAttempt`).
   - `city`/`country` — один запрос к geo-IP API (см. ниже), best-effort.
4. Подписывает JWT как раньше, добавив `sid` в payload.

`SessionPayload` получает новое обязательное поле `sid?: string` — но
вызывающий код его не передаёт, `createSession` вычисляет сам. Ни один из 5
текущих call-site’ов (`login`, `activate/[token]`, `profile`,
`change-password`, `profile` повторно) не меняется.

### `getSession()` (`src/lib/auth.ts`)

После успешной проверки `isActive`/`sessionEpoch` — троттлированный «тач»:

```ts
await db.userSession.updateMany({
  where: { id: tok.sid, lastSeenAt: { lt: new Date(Date.now() - 60_000) } },
  data: { lastSeenAt: new Date() },
});
```

`updateMany` с условием в `WHERE` — если сессию уже трогали за последние 60
секунд, это no-op UPDATE (Postgres всё равно даёт `0 rows affected` быстро,
без реальной записи страницы). Один дополнительный запрос на рендер страницы,
не больше, чем уже есть сегодня (сам `getSession` и так делает
`db.user.findUnique` на каждый рендер).

Не блокирует ответ пользователю: `await`-им, но не оборачиваем в try/catch —
если БД недоступна, это уже сломает `getSession()` целиком (как и сегодня).

### `destroySession()` (`src/lib/auth.ts`)

Перед удалением куки читает `sid` из текущего токена и помечает
`UserSession.revokedAt = now()`.

### Отзыв «всех устройств»

Существующий механизм `sessionEpoch` (инкремент при смене пароля/блокировке)
уже делает старые JWT недействительными при следующей проверке в
`getSession()` — просто вдобавок стоит проставить `revokedAt` всем активным
`UserSession` этого пользователя в тот же момент. Все 4 места, где сегодня
инкрементируется `sessionEpoch` (grep `sessionEpoch: { increment`), получают
рядом `db.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })`:

- `src/app/(app)/profile/actions.ts:56` — смена пароля из профиля.
- `src/app/(app)/profile/actions.ts:186` — «выйти со всех устройств».
- `src/app/change-password/actions.ts:39` — принудительная смена после OTP.
- `src/lib/otp.ts:55` — перевыпуск OTP/PIN (переиздание доступа).

## Разбор User-Agent (`parseUserAgent`)

Новый маленький хелпер, без зависимостей:

```ts
function parseUserAgent(ua: string | null): { device: string; browser: string | null } {
  if (!ua) return { device: "unknown", browser: null };
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome" :
    /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" :
    null;
  return { device, browser };
}
```

## Geo-IP

Бесплатный `https://ipapi.co/{ip}/json/` (без ключа, HTTPS, хватает лимита на
объём логинов этого приложения). Вызывается **один раз при создании новой
сессии**, не на каждый тач. Таймаут 2 секунды
(`AbortSignal.timeout(2000)`), любая ошибка/таймаут — `city`/`country`
остаются `null`, логин не прерывается. IP вида `unknown` (нет данных) —
geo-запрос пропускается вовсе.

## Permission

Новое право `sessions.view` в `src/lib/rbac.ts` (`DEFAULT_PERMISSIONS`,
`PERMISSION_LABELS`), по умолчанию только `C_AND_B` — тот же паттерн, что у
`audit.view`.

## Страница `/admin/sessions`

Новый роут `src/app/(admin)/admin/sessions/page.tsx`, серверный компонент:

- Гейт: `if (!can(session.roles, "sessions.view")) redirect("/")`.
- Запрос: `db.userSession.findMany({ where: { revokedAt: null, lastSeenAt: { gt: onlineThreshold } }, include: { user: { include: { employee: true } } }, orderBy: { lastSeenAt: "desc" } })`.
- Таблица/карточки: имя сотрудника · отдел · иконка устройства (телефон/ноутбук)
  · браузер · город, страна · «онлайн» (зелёная точка) или «N мин назад».
- Пункт меню — в `src/app/(app)/_nav.ts`, рядом с `audit.view`, иконка из
  существующего набора `ICONS` (или новая простая, если подходящей нет).

## Живое обновление

Ничего нового изобретать не нужно — уже есть `/api/stream` (SSE,
`src/app/api/stream/route.ts`) + `<LiveRefresh/>` в `_shell.tsx`, который уже
оборачивает все страницы под `(app)`, включая `/admin/*`. Добавляю в
`signatureFor()`:

```ts
if (can(roles, "sessions.view")) {
  const [count, agg] = await Promise.all([
    db.userSession.count({ where: { revokedAt: null, lastSeenAt: { gt: onlineThreshold() } } }),
    db.userSession.aggregate({ _max: { lastSeenAt: true }, where: { revokedAt: null } }),
  ]);
  parts.push(`sess:${count}:${agg._max.lastSeenAt?.getTime() ?? 0}`);
}
```

C&B и так попадает в `isStaff` (есть `applications.decide`/`coupons.manage`),
поэтому опрос уже каждые 8 секунд — ничего донастраивать не нужно.

## Миграция

Одна аддитивная миграция: `CREATE TABLE "UserSession" (...)`. Никаких
изменений существующих таблиц. Применяется как обычно через
`predeploy.mjs` на следующем деплое, либо вручную `prisma migrate deploy`
при локальной проверке (с явного разрешения пользователя — та же процедура,
что и раньше в этой сессии).

## Что сознательно не делаем (YAGNI)

- Не показываем историю сессий/устройств за прошлое — только текущие активные.
- Не строим отдельную интерактивную карту/график — просто список.
- Не добавляем ручной «завершить сессию» (кик с устройства) в этой итерации —
  можно добавить позже тем же способом, что и `sessionEpoch`, если понадобится.
- Не вводим внешнюю UA-parsing библиотеку — разбор regex достаточен для
  «телефон/ноутбук + браузер».
- Не кэшируем/не ретраим geo-IP при сбое — просто пустое поле.

## Проверка (тест-план)

1. `npx tsc --noEmit`, `npx eslint src`.
2. Локально (с явного разрешения пользователя — боевая БД): накатить
   миграцию, войти под demo-аккаунтом с двух «вкладок» (имитация телефон +
   ноутбук через разные User-Agent), убедиться, что на `/admin/sessions`
   видно две строки, `lastSeenAt` обновляется не чаще раза в 60 сек.
   Выйти — сессия пропадает из списка (revokedAt проставлен).
3. Проверить, что смена пароля / обновление профиля не создают лишних строк
   `UserSession` (переиспользуют тот же `sid`).
4. Проверить деградацию geo-IP: временно недоступный/медленный ipapi.co не
   должен блокировать логин дольше ~2 секунд и не должен ронять его.
