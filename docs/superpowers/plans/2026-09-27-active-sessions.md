# Активные сессии («Кто онлайн») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать C&B список реально активных сейчас сотрудников (устройство, браузер, город/страна, «онлайн»/«N мин назад») на новой странице `/admin/sessions`, с live-обновлением без ручного refresh.

**Architecture:** Новая таблица `UserSession` (id = `sid`, зашитый в существующий JWT). `createSession()` переиспользует `sid` текущей валидной сессии того же пользователя (не плодит дубли при смене пароля/профиля) или заводит новую строку с device/browser (разбор User-Agent) и city/country (best-effort geo-IP). `getSession()` троттлированно (раз в 60 сек) обновляет `lastSeenAt`. «Онлайн» = `revokedAt IS NULL AND lastSeenAt > now()-3мин`. Явный logout помечает `revokedAt`; при смене пароля/epoch-бампе отдельная пометка не нужна — сессия на другом устройстве просто перестаёт обновляться и естественно «остывает» за 3 минуты. Live-обновление переиспользует уже существующий SSE-канал `/api/stream` + `<LiveRefresh/>`.

**Tech Stack:** Next.js 16 (App Router, Server Actions/Components), Prisma 6 + PostgreSQL (Supabase), TypeScript, Tailwind. **В проекте нет автотестов** (ни одного `*.test.ts`, нет vitest/jest) — верификация каждого шага это `npx tsc --noEmit` + `npx eslint <файлы>`, для чистой логики (без сети/БД) — одноразовый `npx tsx` скрипт в scratch-файле, который удаляется сразу после проверки вывода.

**Spec:** `docs/superpowers/specs/2026-09-27-active-sessions-design.md`

## Global Constraints

- **Локальный dev подключён напрямую к БОЕВОЙ базе** (Supabase, `connection_limit=1`, см. `.env`). Это не отдельная тестовая среда.
- **Никогда не выполнять `npx prisma migrate deploy`, `db push`, или любую другую команду, меняющую живую схему/данные, без явного разрешения пользователя в моменте.** Так же — никаких live-запросов типа `UPDATE`/`DELETE` вручную против прод-БД.
- `connection_limit=1` — не открывать параллельно несколько dev-серверов/вкладок, бьющих в БД одновременно; лишний параллельный трафик роняет логин у всех.
- Не добавлять новых npm-зависимостей — разбор User-Agent и geo-IP делаются без библиотек (см. Task 2).
- Следовать существующим паттернам файла (комментарии на русском, тот же стиль, что в соседних файлах — не переписывать импорты/форматирование без необходимости).
- После КАЖДОЙ задачи: `npx tsc --noEmit` и `npx eslint <изменённые файлы>` должны быть чистыми (0 ошибок; существующие unrelated warnings в проекте — не блокер).

---

## Task 1: Схема — модель `UserSession`

**Files:**
- Modify: `prisma/schema.prisma` — добавить relation в `model User` и новую модель `UserSession`.
- Create: `prisma/migrations/20260927100000_user_sessions/migration.sql`

**Interfaces:**
- Produces: Prisma-модель `UserSession` с полями `id, userId, device, browser, ip, city, country, createdAt, lastSeenAt, revokedAt`; `User.sessions: UserSession[]`.

- [ ] **Step 1: Добавить relation в `model User`**

В `prisma/schema.prisma` найти блок relations внутри `model User` (рядом со строкой `reportPresets   ReportPreset[]`) и добавить туда же:

```prisma
  sessions        UserSession[]
```

- [ ] **Step 2: Добавить модель `UserSession`**

В конец файла `prisma/schema.prisma` (после последней модели) добавить:

```prisma
/// Активная/прошедшая сессия входа (§ "Кто онлайн"). id = sid, зашитый в JWT
/// (см. createSession в src/lib/auth.ts). Онлайн-статус вычисляется на
/// чтении: revokedAt IS NULL AND lastSeenAt > now() - 3 минуты
/// (см. ONLINE_WINDOW_MS в src/lib/user-sessions.ts) — отдельного булева
/// поля "online" нет, чтобы не рассинхронизировалось с порогом.
model UserSession {
  id         String    @id
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId     String
  device     String    // "mobile" | "desktop" | "unknown" — грубый разбор User-Agent
  browser    String?
  ip         String?
  city       String?
  country    String?
  createdAt  DateTime  @default(now())
  lastSeenAt DateTime  @default(now())
  revokedAt  DateTime?

  @@index([userId])
  @@index([lastSeenAt])
}
```

- [ ] **Step 3: Сгенерировать Prisma Client (без обращения к БД)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` — без ошибок.

- [ ] **Step 4: Написать файл миграции вручную**

Создать `prisma/migrations/20260927100000_user_sessions/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "browser" TEXT,
    "ip" TEXT,
    "city" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_lastSeenAt_idx" ON "UserSession"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок (модель пока никем не используется, но должна собраться).

- [ ] **Step 6: НЕ применять миграцию автоматически**

Это аддитивная миграция (только `CREATE TABLE`), но база — боевая
(`connection_limit=1`). **Спросить пользователя явно**, можно ли сейчас
выполнить `npx prisma migrate deploy` для локальной проверки, ИЛИ оставить
миграцию неприменённой — она накатится сама при следующем деплое через
`scripts/predeploy.mjs`. Не выполнять `migrate deploy` без ответа пользователя
в текущем диалоге.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260927100000_user_sessions
git commit -m "feat(sessions): схема UserSession (кто онлайн)"
```

---

## Task 2: Разбор User-Agent, geo-IP, общий фильтр "онлайн"

**Files:**
- Create: `src/lib/user-agent.ts`
- Create: `src/lib/geo-ip.ts`
- Create: `src/lib/user-sessions.ts`

**Interfaces:**
- Produces:
  - `parseUserAgent(ua: string | null): { device: "mobile" | "desktop" | "unknown"; browser: string | null }`
  - `lookupGeoIp(ip: string | null): Promise<{ city: string | null; country: string | null }>`
  - `ONLINE_WINDOW_MS: number`
  - `onlineSessionWhere(): { revokedAt: null; lastSeenAt: { gt: Date } }`

- [ ] **Step 1: Написать `src/lib/user-agent.ts`**

```ts
export type ParsedUserAgent = { device: "mobile" | "desktop" | "unknown"; browser: string | null };

/**
 * Грубый разбор User-Agent — без внешней зависимости (ua-parser и т.п. не
 * нужны, хватает "телефон/ноутбук + название браузера" для § "Кто онлайн").
 */
export function parseUserAgent(ua: string | null): ParsedUserAgent {
  if (!ua) return { device: "unknown", browser: null };
  const device: ParsedUserAgent["device"] = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome" :
    /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" :
    null;
  return { device, browser };
}
```

- [ ] **Step 2: Проверить `parseUserAgent` одноразовым скриптом**

Создать временный файл `_verify-ua.mjs` в корне проекта:

```js
import { parseUserAgent } from "./src/lib/user-agent.ts";

const cases = [
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "mobile", "Safari"],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", "desktop", "Chrome"],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/128.0.0.0", "desktop", "Edge"],
  [null, "unknown", null],
];
for (const [ua, wantDevice, wantBrowser] of cases) {
  const { device, browser } = parseUserAgent(ua);
  const ok = device === wantDevice && browser === wantBrowser;
  console.log(ok ? "OK" : "FAIL", JSON.stringify({ ua, device, browser, wantDevice, wantBrowser }));
}
```

Run: `npx tsx _verify-ua.mjs`
Expected: четыре строки `OK`. Если хоть одна `FAIL` — поправить regex в `parseUserAgent` и повторить.

- [ ] **Step 3: Удалить временный скрипт**

Run: `rm _verify-ua.mjs`

- [ ] **Step 4: Написать `src/lib/geo-ip.ts`**

```ts
import "server-only";

export type GeoInfo = { city: string | null; country: string | null };

/**
 * Best-effort геолокация по IP — https://ipapi.co, без ключа и без новой
 * npm-зависимости. Вызывается ОДИН раз при создании новой UserSession (не на
 * каждый тач lastSeenAt). Любая ошибка/таймаут — просто { null, null },
 * логин не должен падать из-за стороннего сервиса.
 */
export async function lookupGeoIp(ip: string | null): Promise<GeoInfo> {
  if (!ip || ip === "unknown") return { city: null, country: null };
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { city: null, country: null };
    const data = (await res.json()) as { city?: string; country_name?: string; error?: boolean };
    if (data.error) return { city: null, country: null };
    return { city: data.city ?? null, country: data.country_name ?? null };
  } catch {
    return { city: null, country: null };
  }
}
```

- [ ] **Step 5: Проверить деградацию `lookupGeoIp` одноразовым скриптом**

Создать временный `_verify-geo.mjs`:

```js
import { lookupGeoIp } from "./src/lib/geo-ip.ts";

const a = await lookupGeoIp(null);
console.log(a.city === null && a.country === null ? "OK: null ip" : "FAIL: null ip", a);

const b = await lookupGeoIp("unknown");
console.log(b.city === null && b.country === null ? "OK: unknown ip" : "FAIL: unknown ip", b);

const c = await lookupGeoIp("8.8.8.8");
console.log(typeof c.city === "string" || c.city === null ? "OK: real ip did not throw" : "FAIL", c);
```

Run: `npx tsx _verify-geo.mjs`
Expected: три строки `OK`. Третий вызов реально бьёт в сеть (ipapi.co) — если
сеть недоступна из песочницы, ошибка должна быть поймана и напечатать `OK`
(с `city: null`), а не упасть с необработанным исключением.

- [ ] **Step 6: Удалить временный скрипт**

Run: `rm _verify-geo.mjs`

- [ ] **Step 7: Написать `src/lib/user-sessions.ts`**

```ts
import "server-only";

/** Порог "онлайн сейчас" — используется и страницей /admin/sessions, и SSE-сигнатурой /api/stream. */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

/** Prisma-условие "сессия сейчас активна" — единое место, чтобы страница и live-сигнатура не разъехались. */
export function onlineSessionWhere() {
  return {
    revokedAt: null,
    lastSeenAt: { gt: new Date(Date.now() - ONLINE_WINDOW_MS) },
  } as const;
}
```

- [ ] **Step 8: Проверить типы и линт**

Run: `npx tsc --noEmit && npx eslint src/lib/user-agent.ts src/lib/geo-ip.ts src/lib/user-sessions.ts`
Expected: без ошибок.

- [ ] **Step 9: Commit**

```bash
git add src/lib/user-agent.ts src/lib/geo-ip.ts src/lib/user-sessions.ts
git commit -m "feat(sessions): разбор User-Agent, geo-IP, общий фильтр онлайн"
```

---

## Task 3: `auth.ts` — жизненный цикл `sid`

**Files:**
- Modify: `src/lib/auth.ts` (весь файл — см. точные диффы ниже)

**Interfaces:**
- Consumes: `parseUserAgent` (Task 2), `lookupGeoIp` (Task 2), `clientMeta` (существующий `src/lib/client-meta.ts`), `db.userSession` (Task 1).
- Produces: `SessionToken = SessionPayload & { epoch: number; sid: string }`; `readToken(): Promise<SessionToken | null>` (было `SessionPayload | null` — расширяющее, единственный внешний вызывающий `src/app/(app)/actions.ts:254` использует только `tok.sub`, не ломается).

- [ ] **Step 1: Добавить импорты**

В начало `src/lib/auth.ts`, после существующих импортов добавить:

```ts
import { randomUUID } from "node:crypto";
import { clientMeta } from "@/lib/client-meta";
import { parseUserAgent } from "@/lib/user-agent";
import { lookupGeoIp } from "@/lib/geo-ip";
```

- [ ] **Step 2: Добавить константу троттлинга**

После `const MAX_AGE_CONTRACTOR = ...` добавить:

```ts
// Не чаще раза в минуту — connection_limit=1 на боевой БД, лишний write на
// каждый рендер страницы недопустим (см. хендоф от 27 сентября про
// исчерпание пула соединений).
const TOUCH_THROTTLE_MS = 60_000;
```

- [ ] **Step 3: Добавить тип `SessionToken`**

После `export type SessionPayload = {...};` добавить:

```ts
/** Что реально лежит в подписанном JWT — включает sid, которого нет во входном SessionPayload. */
export type SessionToken = SessionPayload & { epoch: number; sid: string };
```

- [ ] **Step 4: Переписать `createSession`**

Заменить всю функцию `createSession` на:

```ts
export async function createSession(payload: SessionPayload) {
  const existing = await readToken();
  const epoch =
    payload.epoch ??
    (
      await db.user.findUnique({
        where: { id: payload.sub },
        select: { sessionEpoch: true },
      })
    )?.sessionEpoch ??
    0;

  // Переиспользуем sid текущей валидной сессии ТОГО ЖЕ пользователя —
  // createSession перевыпускает JWT не только при логине, но и при смене
  // пароля/профиля (см. profile/actions.ts, change-password/actions.ts):
  // это не новое устройство, новую строку UserSession заводить не нужно.
  // Другой пользователь (общий терминал подрядчика) или невалидная/отсутствующая
  // кука — считаем новой сессией.
  let sid = existing && existing.sub === payload.sub ? existing.sid : null;
  if (!sid) {
    sid = randomUUID();
    const { ip, userAgent } = await clientMeta();
    const { device, browser } = parseUserAgent(userAgent);
    const geo = await lookupGeoIp(ip);
    await db.userSession.create({
      data: {
        id: sid,
        userId: payload.sub,
        device,
        browser,
        ip: ip === "unknown" ? null : ip,
        city: geo.city,
        country: geo.country,
      },
    });
  }

  const maxAge = payload.roles.includes("CONTRACTOR") ? MAX_AGE_CONTRACTOR : MAX_AGE;
  const token = await new SignJWT({ ...payload, epoch, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}
```

- [ ] **Step 5: Переписать `destroySession`**

```ts
export async function destroySession() {
  const tok = await readToken();
  if (tok?.sid) {
    await db.userSession.updateMany({
      where: { id: tok.sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const jar = await cookies();
  jar.delete(COOKIE);
}
```

- [ ] **Step 6: Изменить сигнатуру и тело `readToken`**

Заменить всю функцию `readToken` на:

```ts
export async function readToken(): Promise<SessionToken | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionToken;
  } catch {
    return null;
  }
}
```

(единственное отличие от текущей версии — тип возврата и `as unknown as SessionToken` вместо `SessionPayload`).

- [ ] **Step 7: Добавить touch в `getSession`**

В теле `getSession` (внутри `cache(async () => {...})`), после строки
`if ((tok.epoch ?? 0) !== user.sessionEpoch) return null;` и **до** `return {...}`
добавить:

```ts
  if (tok.sid) {
    await db.userSession.updateMany({
      where: { id: tok.sid, lastSeenAt: { lt: new Date(Date.now() - TOUCH_THROTTLE_MS) } },
      data: { lastSeenAt: new Date() },
    });
  }
```

- [ ] **Step 8: Проверить типы и линт**

Run: `npx tsc --noEmit && npx eslint src/lib/auth.ts`
Expected: без ошибок. Если `tsc` ругается на `existing.sub`/`existing.sid` —
убедиться, что `existing` типизирован как `SessionToken | null` (результат
`readToken()`), а не `SessionPayload | null`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(sessions): auth.ts — sid, touch lastSeenAt, revoke на logout"
```

---

## Task 4: Право `sessions.view`

**Files:**
- Modify: `src/lib/rbac.ts`

**Interfaces:**
- Consumes: ничего нового.
- Produces: `Permission` включает `"sessions.view"`; `can(roles, "sessions.view")`.

- [ ] **Step 1: Добавить право в `DEFAULT_PERMISSIONS`**

В `src/lib/rbac.ts`, в объект `DEFAULT_PERMISSIONS`, сразу после строки
`"gamification.manage": ["C_AND_B"],` добавить:

```ts
  "sessions.view": ["C_AND_B"],
```

- [ ] **Step 2: Добавить подпись в `PERMISSION_LABELS`**

В объект `PERMISSION_LABELS`, сразу после
`"gamification.manage": "Геймификация: задачи, монеты, магазин",` добавить:

```ts
  "sessions.view": "Кто онлайн: активные сессии сотрудников",
```

- [ ] **Step 3: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок (тип `Permission` — производный от ключей объекта,
обновится сам).

- [ ] **Step 4: Commit**

```bash
git add src/lib/rbac.ts
git commit -m "feat(sessions): право sessions.view"
```

---

## Task 5: Пункт меню и переводы

**Files:**
- Modify: `src/app/(app)/_nav.ts`
- Modify: `src/lib/i18n/dict.ts`

**Interfaces:**
- Consumes: `can` из `@/lib/rbac` (уже импортирован в `_nav.ts`), `ICONS` (тот же файл).
- Produces: пункт меню `/admin/sessions`; ключи `nav.sessions`, `sessionsAdmin.*` во всех трёх локалях (ru/tg/uz).

- [ ] **Step 1: Добавить иконку**

В `src/app/(app)/_nav.ts`, в объект `ICONS` (после строки `flask: "..."`),
добавить простую иконку в духе Feather "wifi" (сигнал/подключение):

```ts
  online: "M5 13a10 10 0 0 1 14 0||M8.5 16.5a5 5 0 0 1 7 0||M12 20h.01",
```

- [ ] **Step 2: Добавить пункт меню**

В `src/app/(app)/_nav.ts`, сразу после блока

```ts
  if (can(roles, "audit.view"))
    add("admin", t("nav.adminGroup"), {
      href: "/admin/audit",
      label: t("nav.audit"),
      desc: "история действий: кто, что и когда изменял, согласования, входы",
      icon: ICONS.history,
    });
```

добавить новый блок:

```ts
  if (can(roles, "sessions.view"))
    add("admin", t("nav.adminGroup"), {
      href: "/admin/sessions",
      label: t("nav.sessions"),
      desc: "кто сейчас на сайте: устройство, браузер, город",
      icon: ICONS.online,
    });
```

- [ ] **Step 3: Добавить `nav.sessions` в русскую локаль**

В `src/lib/i18n/dict.ts` найти строку `"nav.audit": "Аудит",` (первое
вхождение, русский блок) и добавить сразу после неё:

```ts
    "nav.sessions": "Кто онлайн",
```

- [ ] **Step 4: Добавить `nav.sessions` в таджикскую локаль**

Найти второе вхождение `"nav.audit": "Аудит",` (блок `tg`) и добавить после:

```ts
    "nav.sessions": "Кӣ онлайн аст",
```

- [ ] **Step 5: Добавить `nav.sessions` в узбекскую локаль**

Найти `"nav.audit": "Audit",` (блок `uz`) и добавить после:

```ts
    "nav.sessions": "Kim onlayn",
```

- [ ] **Step 6: Добавить блок `sessionsAdmin.*` — русский**

В русском блоке `dict.ts`, сразу после блока `gamificationAdmin.*` (после
последней строки `"gamificationAdmin.reject": ...` — найти её точный текст
командой `grep -n '"gamificationAdmin.reject"' src/lib/i18n/dict.ts` и
вставить после первого вхождения) добавить:

```ts
    "sessionsAdmin.title": "Кто онлайн",
    "sessionsAdmin.empty": "Сейчас никто не в сети.",
    "sessionsAdmin.colEmployee": "Сотрудник",
    "sessionsAdmin.colDevice": "Устройство",
    "sessionsAdmin.colLocation": "Откуда",
    "sessionsAdmin.colLastSeen": "Активность",
    "sessionsAdmin.online": "Онлайн",
    "sessionsAdmin.deviceMobile": "Телефон",
    "sessionsAdmin.deviceDesktop": "Ноутбук/ПК",
    "sessionsAdmin.deviceUnknown": "Неизвестно",
    "sessionsAdmin.minutesAgoSuffix": "мин назад",
    "sessionsAdmin.locationUnknown": "—",
```

- [ ] **Step 7: Добавить блок `sessionsAdmin.*` — таджикский**

Тем же способом, во втором (tg) вхождении `gamificationAdmin.reject`:

```ts
    "sessionsAdmin.title": "Кӣ онлайн аст",
    "sessionsAdmin.empty": "Ҳоло касе онлайн нест.",
    "sessionsAdmin.colEmployee": "Корманд",
    "sessionsAdmin.colDevice": "Дастгоҳ",
    "sessionsAdmin.colLocation": "Аз куҷо",
    "sessionsAdmin.colLastSeen": "Фаъолият",
    "sessionsAdmin.online": "Онлайн",
    "sessionsAdmin.deviceMobile": "Телефон",
    "sessionsAdmin.deviceDesktop": "Ноутбук/ПК",
    "sessionsAdmin.deviceUnknown": "Номаълум",
    "sessionsAdmin.minutesAgoSuffix": "дақиқа пеш",
    "sessionsAdmin.locationUnknown": "—",
```

- [ ] **Step 8: Добавить блок `sessionsAdmin.*` — узбекский**

В третьем (uz) вхождении `gamificationAdmin.reject`:

```ts
    "sessionsAdmin.title": "Kim onlayn",
    "sessionsAdmin.empty": "Hozircha hech kim onlayn emas.",
    "sessionsAdmin.colEmployee": "Xodim",
    "sessionsAdmin.colDevice": "Qurilma",
    "sessionsAdmin.colLocation": "Qayerdan",
    "sessionsAdmin.colLastSeen": "Faollik",
    "sessionsAdmin.online": "Onlayn",
    "sessionsAdmin.deviceMobile": "Telefon",
    "sessionsAdmin.deviceDesktop": "Noutbuk/PK",
    "sessionsAdmin.deviceUnknown": "Noma'lum",
    "sessionsAdmin.minutesAgoSuffix": "daqiqa oldin",
    "sessionsAdmin.locationUnknown": "—",
```

- [ ] **Step 9: Проверить типы и линт**

Run: `npx tsc --noEmit && npx eslint src/app/\(app\)/_nav.ts src/lib/i18n/dict.ts`
Expected: без ошибок. `tsc` также проверит, что все использованные ключи
(`t("sessionsAdmin.title")` и т.п. в Task 6) существуют в типе `TKey` — эта
проверка сработает только ПОСЛЕ Task 6, здесь просто убеждаемся, что сам
`dict.ts` не сломан синтаксически.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(app)/_nav.ts" src/lib/i18n/dict.ts
git commit -m "feat(sessions): пункт меню и переводы «Кто онлайн»"
```

---

## Task 6: Страница `/admin/sessions`

**Files:**
- Create: `src/app/(admin)/admin/sessions/page.tsx`

**Interfaces:**
- Consumes: `getSession` (`@/lib/auth`), `can` (`@/lib/rbac`), `onlineSessionWhere` (`@/lib/user-sessions`), `getTranslator` (`@/lib/i18n`), UI-компоненты `Card, EmptyState, Table, Badge` (`@/components/ui`).
- Produces: маршрут `GET /admin/sessions`.

- [ ] **Step 1: Написать страницу**

Создать `src/app/(admin)/admin/sessions/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getTranslator } from "@/lib/i18n";
import { Badge, Card, EmptyState, SectionTitle, Table } from "@/components/ui";
import { onlineSessionWhere } from "@/lib/user-sessions";

export const dynamic = "force-dynamic";

/** "3 мин назад" / "сейчас" — без внешней библиотеки, только для этой страницы. */
function minutesAgo(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

export default async function SessionsAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "sessions.view")) redirect("/");
  const t = await getTranslator();

  const sessions = await db.userSession.findMany({
    where: onlineSessionWhere(),
    include: { user: { include: { employee: { select: { fullName: true, department: true } } } } },
    orderBy: { lastSeenAt: "desc" },
  });

  const deviceLabel = (device: string) =>
    device === "mobile" ? t("sessionsAdmin.deviceMobile") : device === "desktop" ? t("sessionsAdmin.deviceDesktop") : t("sessionsAdmin.deviceUnknown");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{t("sessionsAdmin.title")}</h1>
      </header>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={sessions.length}>{t("sessionsAdmin.title")}</SectionTitle>
        {sessions.length === 0 ? (
          <EmptyState>{t("sessionsAdmin.empty")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("sessionsAdmin.colEmployee")}</th>
                  <th>{t("sessionsAdmin.colDevice")}</th>
                  <th>{t("sessionsAdmin.colLocation")}</th>
                  <th>{t("sessionsAdmin.colLastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const mins = minutesAgo(s.lastSeenAt);
                  const location = [s.city, s.country].filter(Boolean).join(", ") || t("sessionsAdmin.locationUnknown");
                  return (
                    <tr key={s.id}>
                      <td className="text-ink">
                        {s.user.employee?.fullName ?? s.user.login}
                        {s.user.employee?.department && <span className="text-ink-subtle"> · {s.user.employee.department}</span>}
                      </td>
                      <td>
                        {deviceLabel(s.device)}
                        {s.browser && <span className="text-ink-subtle"> · {s.browser}</span>}
                      </td>
                      <td>{location}</td>
                      <td data-numeric>
                        {mins < 1 ? (
                          <Badge tone="success">{t("sessionsAdmin.online")}</Badge>
                        ) : (
                          `${mins} ${t("sessionsAdmin.minutesAgoSuffix")}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Проверить типы и линт**

Run: `npx tsc --noEmit && npx eslint "src/app/(admin)/admin/sessions/page.tsx"`
Expected: без ошибок. Если `tsc` жалуется на отсутствующий ключ перевода —
значит Task 5 (dict.ts) выполнен не полностью, вернуться и доперевести.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/sessions/page.tsx"
git commit -m "feat(sessions): страница /admin/sessions"
```

---

## Task 7: Live-обновление через существующий `/api/stream`

**Files:**
- Modify: `src/app/api/stream/route.ts`

**Interfaces:**
- Consumes: `onlineSessionWhere` (`@/lib/user-sessions`), `can` (уже импортирован в файле).
- Produces: ничего нового наружу — просто расширяет существующую `signatureFor()`, потребитель (`<LiveRefresh/>`) не меняется.

- [ ] **Step 1: Добавить импорт**

В `src/app/api/stream/route.ts`, к существующим импортам добавить:

```ts
import { onlineSessionWhere } from "@/lib/user-sessions";
```

- [ ] **Step 2: Добавить ветку в `signatureFor`**

Внутри функции `signatureFor`, после блока

```ts
  if (can(roles, "cards.manage")) {
    const [pending, agg] = await Promise.all([
      db.advertisingRequest.count({ where: { status: "PENDING" } }),
      db.advertisingRequest.aggregate({ _max: { updatedAt: true } }),
    ]);
    parts.push(`ad:${pending}:${agg._max.updatedAt?.getTime() ?? 0}`);
  }
```

добавить:

```ts
  if (can(roles, "sessions.view")) {
    const [count, agg] = await Promise.all([
      db.userSession.count({ where: onlineSessionWhere() }),
      db.userSession.aggregate({ _max: { lastSeenAt: true }, where: onlineSessionWhere() }),
    ]);
    parts.push(`sess:${count}:${agg._max.lastSeenAt?.getTime() ?? 0}`);
  }
```

- [ ] **Step 3: Проверить типы и линт**

Run: `npx tsc --noEmit && npx eslint src/app/api/stream/route.ts`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stream/route.ts
git commit -m "feat(sessions): живое обновление /admin/sessions через /api/stream"
```

---

## Итоговая проверка (после всех задач)

- [ ] `npx tsc --noEmit` — чисто.
- [ ] `npx eslint src` — чисто (не считая уже существующих в проекте
      unrelated warnings, см. `_prev`/`_formData` в server actions — это не
      баг, а принятый в проекте паттерн `.bind()`).
- [ ] Спросить пользователя явно, можно ли накатить миграцию
      `20260927100000_user_sessions` (`npx prisma migrate deploy`) для живой
      проверки в браузере: залогиниться под demo-аккаунтом, зайти на
      `/admin/sessions` под C&B, убедиться, что строка появляется и
      `lastSeenAt`/индикатор «онлайн» обновляются сами (SSE) без
      ручного refresh.
- [ ] Убедиться, что смена пароля из профиля не создаёт вторую строку
      `UserSession` для того же устройства (проверить по `id` = `sid`
      в куке до/после — не меняется).
- [ ] Войти под одним и тем же demo-аккаунтом с двух вкладок с разными
      User-Agent (имитация телефон + ноутбук — можно переопределить
      заголовок через devtools/curl) — убедиться, что на `/admin/sessions`
      появляются ДВЕ отдельные строки с разным `device`.
