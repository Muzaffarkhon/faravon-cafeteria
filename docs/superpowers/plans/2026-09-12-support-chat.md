# Чат поддержки (бот ↔ C&B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** когда Telegram-бот не смог опознать человека, дать ему написать
администратору прямо в боте, а C&B — увидеть и ответить из системы.

**Architecture:** две новые таблицы (`SupportThread`, `SupportMessage`),
общая логика в `src/lib/support-chat.ts` (по аналогии с
`src/lib/telegram-link.ts`), новая обработка `callback_query` в вебхуке
(`src/app/api/telegram/route.ts`), новый раздел админки `/admin/support`.

**Tech Stack:** Next.js 16 App Router, Prisma 6 / PostgreSQL (Neon), Telegram
Bot API (webhook). В проекте нет автотестового фреймворка (vitest и т.п. не
подключены) — проверка каждого шага: `npm run typecheck`, `npm run lint`, и
там, где нужно поведение целиком — прямой запрос (`curl`) к локальному
дев-серверу и сверка в базе через одноразовый `npx tsx`-скрипт, как это
делалось в этой сессии раньше.

**Spec:** `docs/superpowers/specs/2026-09-12-support-chat-design.md`

## Global Constraints

- Комментарии в коде и текст в интерфейсе — на русском, в стиле уже
  существующего кода (см. любой файл в `src/lib/`).
- `.env` в этом окружении указывает на боевую базу Neon — миграция и
  ручные проверки идут по-настоящему против неё же (так уже было весь этот
  сеанс). Новые таблицы — чисто аддитивная миграция, риска для
  существующих данных нет.
- Не трогаем `bot/bot.ts` / `bot/link.ts` (локальный long-polling бот) —
  фича нужна только на проде (вебхук), см. спек, раздел «Приложение».
- Каждая задача заканчивается `npm run typecheck && npm run lint` без
  ошибок перед коммитом.
- Коммиты — как в остальной сессии: одно логическое изменение, сообщение
  на русском, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
  в конце. Не пушить — пуш делает пользователь по своей команде.

---

### Task 1: Схема данных — `SupportThread` / `SupportMessage`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: модели `SupportThread { id, seq, telegramId, phone, status, lastMessageAt, createdAt, messages }`, `SupportMessage { id, threadId, direction, body, authorId, readAt, createdAt }`, enумы `SupportThreadStatus` (`OPEN`/`CLOSED`), `SupportMessageDirection` (`IN`/`OUT`). Все последующие задачи используют эти имена и поля как есть.

- [ ] **Шаг 1: Добавить enum'ы рядом с `FeedbackStatus`**

Открой `prisma/schema.prisma`, найди блок:

```prisma
/// Статус обращения обратной связи (обрабатывает C&B).
enum FeedbackStatus {
  NEW    // новое
  READ   // прочитано
  NOTED  // принято к сведению
  CLOSED // закрыто
}
```

Сразу после него вставь:

```prisma

enum SupportThreadStatus {
  OPEN
  CLOSED
}

enum SupportMessageDirection {
  IN  // от гостя
  OUT // от C&B
}
```

- [ ] **Шаг 2: Добавить модели после `model Feedback`**

Найди конец `model Feedback { ... }` (строка перед `model TextBlock {`).
Вставь между ними:

```prisma

/// Один Telegram-чат — один тред, переоткрывается при новом сообщении
/// гостя, а не плодится заново. Заводится, когда бот не смог опознать
/// человека и тот нажал «Написать администратору».
model SupportThread {
  id            String              @id @default(cuid())
  seq           Int                 @unique @default(autoincrement()) // сквозной номер — для короткого отображения (RowId), тот же приём, что и у остальных сущностей
  telegramId    String              @unique
  /// Номер, который человек присылал (если делился контактом) — подсказка
  /// C&B, кто это, даже если официально не опознан.
  phone         String?
  status        SupportThreadStatus @default(OPEN)
  /// НЕ @updatedAt — обновляем явно при каждом сообщении (в обе стороны),
  /// а не при любом изменении строки (например, при правке phone).
  lastMessageAt DateTime            @default(now())
  createdAt     DateTime            @default(now())

  messages SupportMessage[]

  @@index([status, lastMessageAt])
}

model SupportMessage {
  id        String                  @id @default(cuid())
  thread    SupportThread           @relation(fields: [threadId], references: [id])
  threadId  String
  direction SupportMessageDirection
  body      String
  /// Кто из C&B ответил — только для OUT.
  author    User?                   @relation(fields: [authorId], references: [id])
  authorId  String?
  /// Прочитано C&B — только для IN, для счётчика непрочитанных.
  readAt    DateTime?
  createdAt DateTime                @default(now())

  @@index([threadId, createdAt])
}
```

- [ ] **Шаг 3: Добавить обратную связь на `User`**

Найди в `model User` блок с прочими обратными связями:

```prisma
  feedbackHandled Feedback[]             @relation("FeedbackHandler")
```

Сразу под ним добавь строку:

```prisma
  supportReplies  SupportMessage[]
```

- [ ] **Шаг 4: Прогнать миграцию**

```bash
npx prisma migrate dev --name add_support_chat
```

Ожидается: новый файл в `prisma/migrations/<timestamp>_add_support_chat/`,
вывод оканчивается на `Your database is now in sync with your schema.` —
без ошибок. Prisma Client перегенерируется автоматически этим же шагом.

Если `prisma generate` в конце упадёт с `EPERM: operation not permitted,
rename ... query_engine-windows.dll.node` (бывает на Windows, если dev-сервер
держит файл открытым) — остановить dev-сервер и повторить
`npx prisma generate` отдельно.

- [ ] **Шаг 5: Проверить**

```bash
npm run typecheck
```

Ожидается: 0 ошибок (новые модели уже видны через `@prisma/client`, хотя
их пока никто не использует).

- [ ] **Шаг 6: Коммит**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): таблицы чата поддержки (SupportThread/SupportMessage)"
```

---

### Task 2: Право `support.manage`

**Files:**
- Modify: `src/lib/rbac.ts`

**Interfaces:**
- Consumes: ничего нового.
- Produces: `can(roles, "support.manage")` — используют все последующие задачи (страницы, actions, счётчик в шапке).

- [ ] **Шаг 1: Добавить право в матрицу по умолчанию**

В `DEFAULT_PERMISSIONS`, сразу после строки `"audit.view": ["C_AND_B"],`,
добавь:

```ts
  "support.manage": ["C_AND_B"],
```

- [ ] **Шаг 2: Добавить подпись**

В `PERMISSION_LABELS`, сразу после `"audit.view": "Журнал аудита",`,
добавь:

```ts
  "support.manage": "Чат поддержки (когда бот не опознал человека)",
```

- [ ] **Шаг 3: Проверить**

```bash
npm run typecheck && npm run lint
```

Ожидается: без ошибок. `ALL_PERMISSIONS` и `permissionsForRoles` подхватят
новое право автоматически (они строятся из `DEFAULT_PERMISSIONS`).

- [ ] **Шаг 4: Коммит**

```bash
git add src/lib/rbac.ts
git commit -m "feat(rbac): право support.manage для чата поддержки"
```

---

### Task 3: Шаблон уведомления `SUPPORT_MESSAGE`

**Files:**
- Modify: `src/lib/notification-format.ts`
- Modify: `src/app/(app)/admin/notifications/page.tsx`

**Interfaces:**
- Produces: событие `"SUPPORT_MESSAGE"`, доступное `notifyApprovers({ event: "SUPPORT_MESSAGE", payload: { phone } })` (Task 6 это вызывает).

- [ ] **Шаг 1: Добавить в `NOTIFICATION_LABELS`**

В `src/lib/notification-format.ts`, после строки
`GROUP_CARRIED_OVER: "Групповая льгота перенесена на следующий период",`:

```ts
  SUPPORT_MESSAGE: "Новое сообщение в чате поддержки",
```

- [ ] **Шаг 2: Добавить в `NOTIFICATION_EVENTS`**

После `"GROUP_CARRIED_OVER",` в массиве:

```ts
  "SUPPORT_MESSAGE",
```

- [ ] **Шаг 3: Добавить в `DEFAULT_TEMPLATES`**

После блока `GROUP_CARRIED_OVER: { ... },`:

```ts
  SUPPORT_MESSAGE: {
    label: NOTIFICATION_LABELS.SUPPORT_MESSAGE,
    body: "💬 <b>Новое сообщение в чате поддержки</b>[[\nНомер: {phone}]]\n\nОткройте раздел «Чат поддержки».",
  },
```

- [ ] **Шаг 4: Добавить в `TEMPLATE_SAMPLE_VARS`**

После `GROUP_CARRIED_OVER: { card: ... },`:

```ts
  SUPPORT_MESSAGE: { phone: "+992 90 000 00 00" },
```

- [ ] **Шаг 5: Добавить в `TEMPLATE_PLACEHOLDERS`**

После `GROUP_CARRIED_OVER: ["card", "period"],`:

```ts
  SUPPORT_MESSAGE: ["phone"],
```

- [ ] **Шаг 6: Добавить подсказку в админке шаблонов**

В `src/app/(app)/admin/notifications/page.tsx`, в объект `HINTS`, после
строки `SLA_ESCALATION: "...",`:

```ts
  SUPPORT_MESSAGE: "Всем C&B — когда в чате поддержки новое сообщение от гостя.",
```

- [ ] **Шаг 7: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 8: Коммит**

```bash
git add src/lib/notification-format.ts "src/app/(app)/admin/notifications/page.tsx"
git commit -m "feat(notify): шаблон SUPPORT_MESSAGE для чата поддержки"
```

---

### Task 4: Экспортировать `sendTelegram` для переиспользования

**Files:**
- Modify: `src/lib/notification-delivery.ts`

**Interfaces:**
- Produces: `export async function sendTelegram(token: string, chatId: string, html: string): Promise<boolean>` — использует Task 8 (ответ C&B гостю).

- [ ] **Шаг 1: Сделать функцию экспортируемой**

Найди:

```ts
async function sendTelegram(token: string, chatId: string, html: string): Promise<boolean> {
```

Замени на:

```ts
export async function sendTelegram(token: string, chatId: string, html: string): Promise<boolean> {
```

Больше в файле ничего менять не нужно — вызовы внутри самого файла
(`sendTelegram(...)`) продолжают работать как есть.

- [ ] **Шаг 2: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 3: Коммит**

```bash
git add src/lib/notification-delivery.ts
git commit -m "refactor(notify): экспортировать sendTelegram для переиспользования"
```

---

### Task 5: Общая логика чата — `src/lib/support-chat.ts`

**Files:**
- Create: `src/lib/support-chat.ts`

**Interfaces:**
- Consumes: `db` из `@/lib/db`.
- Produces:
  - `openOrReopenThread(telegramId: string): Promise<void>`
  - `appendGuestMessage(telegramId: string, body: string): Promise<{ shouldNotify: boolean; phone: string | null } | null>` — `null`, если активного треда нет (вызывающий код должен показать обычный `WELCOME`).

  Обе функции использует Task 6 (вебхук).

- [ ] **Шаг 1: Написать файл**

```ts
import "server-only";
import { db } from "@/lib/db";

/**
 * Заводит или переоткрывает тред поддержки для этого Telegram-чата.
 * Вызывается по нажатию кнопки «Написать администратору» — до первого
 * реального сообщения гостя.
 */
export async function openOrReopenThread(telegramId: string): Promise<void> {
  await db.supportThread.upsert({
    where: { telegramId },
    create: { telegramId, status: "OPEN" },
    update: { status: "OPEN" },
  });
}

/**
 * Сохраняет сообщение гостя в его тред, если тред существует (открыт или
 * ранее был закрыт — тогда переоткрывает). Возвращает `null`, если треда
 * нет вовсе — тогда вызывающий код должен обработать сообщение как обычно
 * (например, показать WELCOME), а не как реплику в чате.
 *
 * `shouldNotify` — true, если это первое сообщение гостя подряд (не
 * дублируем уведомление C&B на каждую строчку, если гость пишет
 * абзацами): считается по тому, было ли предыдущее сообщение в треде от
 * C&B (OUT) или треда вообще не было сообщений.
 */
export async function appendGuestMessage(
  telegramId: string,
  body: string,
): Promise<{ shouldNotify: boolean; phone: string | null } | null> {
  const thread = await db.supportThread.findUnique({ where: { telegramId } });
  if (!thread) return null;

  const last = await db.supportMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
  });
  const shouldNotify = !last || last.direction === "OUT";

  await db.$transaction([
    db.supportMessage.create({ data: { threadId: thread.id, direction: "IN", body } }),
    db.supportThread.update({
      where: { id: thread.id },
      data: { status: "OPEN", lastMessageAt: new Date() },
    }),
  ]);

  return { shouldNotify, phone: thread.phone };
}
```

- [ ] **Шаг 2: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 3: Коммит**

```bash
git add src/lib/support-chat.ts
git commit -m "feat(support): общая логика тредов чата поддержки"
```

---

### Task 6: Вебхук — кнопка, `callback_query`, маршрутизация сообщений

**Files:**
- Modify: `src/app/api/telegram/route.ts`

**Interfaces:**
- Consumes: `openOrReopenThread`, `appendGuestMessage` из `@/lib/support-chat`; `notifyApprovers` из `@/lib/notify`.
- Produces: реальное поведение бота — проверяется вручную в Task 13.

- [ ] **Шаг 1: Импорты**

В начале файла, после
`import { linkByPhone, linkByCode, reissueOtp, SafeLinkError } from "@/lib/telegram-link";`,
добавь:

```ts
import { openOrReopenThread, appendGuestMessage } from "@/lib/support-chat";
import { notifyApprovers } from "@/lib/notify";
```

- [ ] **Шаг 2: Тип для callback-запроса**

После:

```ts
interface TgMessage {
  chat: { id: number };
  from?: { id: number };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}
```

добавь:

```ts
interface TgCallbackQuery {
  id: string;
  from: { id: number };
  message?: { chat: { id: number } };
  data?: string;
}
```

- [ ] **Шаг 3: Кнопка на сообщениях «обратитесь в HR»**

Найди catch-блок в конце `handle()`:

```ts
  } catch (e) {
    // Наружу — только заранее одобренный текст. Всё прочее (Prisma, сеть)
    // логируем, пользователю — общая фраза (не оракул для перебора).
    if (e instanceof SafeLinkError) {
      await send(chatId, `⚠️ ${e.message}`);
    } else {
      console.error("[telegram] ошибка обработки update:", e);
      await send(chatId, "⚠️ Не удалось обработать запрос. Попробуйте позже или обратитесь в HR.");
    }
  }
```

Замени на:

```ts
  } catch (e) {
    // Наружу — только заранее одобренный текст. Всё прочее (Prisma, сеть)
    // логируем, пользователю — общая фраза (не оракул для перебора).
    if (e instanceof SafeLinkError) {
      // Любое сообщение об ошибке, которое отправляет человека «в HR» —
      // это и есть тупик, который решает чат поддержки. Правило по
      // подстроке, а не по списку сообщений: новая ошибка с той же фразой
      // получит кнопку сама, без правки этого места.
      const extra = /обратитесь в HR/i.test(e.message)
        ? {
            reply_markup: {
              inline_keyboard: [[{ text: "Написать администратору", callback_data: "support:start" }]],
            },
          }
        : {};
      await send(chatId, `⚠️ ${e.message}`, extra);
    } else {
      console.error("[telegram] ошибка обработки update:", e);
      await send(chatId, "⚠️ Не удалось обработать запрос. Попробуйте позже или обратитесь в HR.");
    }
  }
```

- [ ] **Шаг 4: Маршрутизация обычных сообщений в открытый тред**

Найди последнюю строку тела `handle()` перед `catch`:

```ts
    await send(chatId, WELCOME, CONTACT_KEYBOARD);
  } catch (e) {
```

Замени на:

```ts
    // Обычное сообщение (не команда) — если для этого чата уже открыт
    // (или раньше был) тред поддержки, это реплика в чат, а не непонятый
    // ввод. Команды (/code, /login и т.п.) до этой точки не доходят —
    // они обработаны выше и возвращаются раньше.
    if (text && !text.startsWith("/")) {
      const routed = await appendGuestMessage(telegramId, text);
      if (routed) {
        if (routed.shouldNotify) {
          await notifyApprovers({
            event: "SUPPORT_MESSAGE",
            payload: { phone: routed.phone ?? "" },
          });
        }
        return;
      }
    }

    await send(chatId, WELCOME, CONTACT_KEYBOARD);
  } catch (e) {
```

- [ ] **Шаг 5: Обработчик `callback_query`**

После конца функции `handle` (после её закрывающей `}`, перед
`export async function POST`), добавь:

```ts
async function handleCallback(cb: TgCallbackQuery) {
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  if (cb.data !== "support:start" || !cb.message) return;

  const telegramId = String(cb.from.id);
  await openOrReopenThread(telegramId);
  await send(
    cb.message.chat.id,
    "Опишите ваш вопрос — администратор увидит его и ответит здесь же, в этом чате.",
  );
}
```

- [ ] **Шаг 6: Принять `callback_query` в `POST`**

Найди:

```ts
export async function POST(req: NextRequest) {
  if (!SECRET || !safeEqual(req.headers.get("x-telegram-bot-api-secret-token"), SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: { message?: TgMessage };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (update.message) await handle(update.message);
  return NextResponse.json({ ok: true });
}
```

Замени на:

```ts
export async function POST(req: NextRequest) {
  if (!SECRET || !safeEqual(req.headers.get("x-telegram-bot-api-secret-token"), SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: { message?: TgMessage; callback_query?: TgCallbackQuery };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (update.message) await handle(update.message);
  else if (update.callback_query) await handleCallback(update.callback_query);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Шаг 7: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 8: Коммит**

```bash
git add src/app/api/telegram/route.ts
git commit -m "feat(telegram): кнопка «Написать администратору» и обработка чата"
```

---

### Task 7: Разрешить вебхуку присылать нажатия кнопок

**Files:**
- Modify: `scripts/set-webhook.ts`

**Interfaces:**
- Не производит ничего для кода — операционная настройка Telegram.

- [ ] **Шаг 1: Добавить `callback_query` в `allowed_updates`**

Найди:

```ts
    allowed_updates: ["message"],
```

Замени на:

```ts
    allowed_updates: ["message", "callback_query"],
```

- [ ] **Шаг 2: Проверить**

```bash
npm run typecheck
```

- [ ] **Шаг 3: Коммит**

```bash
git add scripts/set-webhook.ts
git commit -m "fix(telegram): пропускать callback_query через вебхук"
```

**Важно (не шаг кода, а напоминание на потом):** этот скрипт нужно один
раз ПОВТОРНО ЗАПУСТИТЬ на выложенном проде (`npx tsx scripts/set-webhook.ts`)
после деплоя — иначе Telegram продолжит слать только `message` и нажатия
кнопки не будут доходить, хотя код на проде уже новый. Без запуска этого
скрипта фича не заработает даже после «Promote to Production».

---

### Task 8: Серверные действия админки — `src/app/(app)/admin/support/actions.ts`

**Files:**
- Create: `src/app/(app)/admin/support/actions.ts`

**Interfaces:**
- Consumes: `sendTelegram` из `@/lib/notification-delivery` (Task 4), `escHtml` из `@/lib/notification-format`.
- Produces: `replyToThread(threadId: string, body: string): Promise<ActionResult>`, `closeThread(threadId: string): Promise<ActionResult>`, `markThreadRead(threadId: string): Promise<void>` — использует Task 10 (`_thread-view.tsx`).

- [ ] **Шаг 1: Написать файл**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/action-result";
import { sendTelegram } from "@/lib/notification-delivery";
import { escHtml } from "@/lib/notification-format";

function revalidateAll(threadId: string) {
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${threadId}`);
}

/** Ответить гостю: уходит в Telegram и сохраняется в переписке. */
export async function replyToThread(threadId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    const text = body.trim();
    if (!text) throw new Error("Введите текст ответа.");

    const thread = await db.supportThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new Error("Диалог не найден.");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан — отправка недоступна.");

    // Экранируем: это обычный текст от человека, а не шаблон с разметкой —
    // случайные `<`/`&` не должны ломать HTML-сообщение в Telegram.
    const ok = await sendTelegram(token, thread.telegramId, escHtml(text));
    if (!ok) throw new Error("Не удалось отправить сообщение в Telegram.");

    await db.$transaction([
      db.supportMessage.create({
        data: { threadId, direction: "OUT", body: text, authorId: s.user.id },
      }),
      db.supportMessage.updateMany({
        where: { threadId, direction: "IN", readAt: null },
        data: { readAt: new Date() },
      }),
      db.supportThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);

    await audit({
      actorId: s.user.id,
      action: "SUPPORT_REPLY_SENT",
      entityType: "SupportThread",
      entityId: threadId,
    });

    revalidateAll(threadId);
  });
}

/** Закрыть диалог. Если гость напишет снова — переоткроется сам. */
export async function closeThread(threadId: string): Promise<ActionResult> {
  return runAction(async () => {
    const s = await requireSession();
    assertCan(s.roles, "support.manage");

    await db.supportThread.update({ where: { id: threadId }, data: { status: "CLOSED" } });
    await audit({
      actorId: s.user.id,
      action: "SUPPORT_THREAD_CLOSED",
      entityType: "SupportThread",
      entityId: threadId,
    });

    revalidateAll(threadId);
  });
}

/** Отметить входящие сообщения прочитанными (вызывается при открытии диалога). */
export async function markThreadRead(threadId: string): Promise<void> {
  const s = await requireSession();
  assertCan(s.roles, "support.manage");

  await db.supportMessage.updateMany({
    where: { threadId, direction: "IN", readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/admin/support");
}
```

- [ ] **Шаг 2: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 3: Коммит**

```bash
git add "src/app/(app)/admin/support/actions.ts"
git commit -m "feat(support): серверные действия — ответить, закрыть, отметить прочитанным"
```

---

### Task 9: Список диалогов — `/admin/support`

**Files:**
- Create: `src/app/(app)/admin/support/page.tsx`

**Interfaces:**
- Consumes: ничего из предыдущих задач напрямую (читает `db.supportThread` сам); ссылается на `/admin/support/[id]` (Task 10).

- [ ] **Шаг 1: Написать файл**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader, RowId, Table, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");

  const threads = await db.supportThread.findMany({
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { direction: "IN", readAt: null } } } },
    },
  });

  // Непрочитанные — наверх, дальше по свежести. Тредов немного, сортировка
  // в памяти проще и понятнее, чем городить это в orderBy.
  threads.sort((a, b) => {
    const unread = (b._count.messages > 0 ? 1 : 0) - (a._count.messages > 0 ? 1 : 0);
    return unread !== 0 ? unread : b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Чат поддержки"
        description="Люди, которых бот не смог опознать при входе, и переписка с ними."
      />

      {threads.length === 0 ? (
        <EmptyState>Пока никто не писал.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table stickyHeader>
            <thead>
              <tr>
                <th>ID</th>
                <th>Гость</th>
                <th>Последнее сообщение</th>
                <th>Статус</th>
                <th>Когда</th>
                <th className="text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t) => {
                const last = t.messages[0];
                const unread = t._count.messages;
                return (
                  <tr key={t.id}>
                    <td>
                      <RowId id={t.id} seq={t.seq} />
                    </td>
                    <td>
                      <span className="font-medium text-ink">Гость №{t.seq}</span>
                      {t.phone && <span className="ml-1.5 text-xs text-ink-muted">· {t.phone}</span>}
                      {unread > 0 && (
                        <Badge tone="warning" className="ml-2">
                          {unread}
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-[26rem] truncate text-ink-muted">
                      {last ? `${last.direction === "OUT" ? "Вы: " : ""}${last.body}` : "—"}
                    </td>
                    <td>
                      <Badge tone={t.status === "OPEN" ? "success" : "neutral"}>
                        {t.status === "OPEN" ? "Открыт" : "Закрыт"}
                      </Badge>
                    </td>
                    <td className="text-ink-muted">
                      {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(
                        t.lastMessageAt,
                      )}
                    </td>
                    <td className="text-right">
                      <Link href={`/admin/support/${t.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                        Открыть
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Шаг 2: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 3: Коммит**

```bash
git add "src/app/(app)/admin/support/page.tsx"
git commit -m "feat(support): страница списка диалогов /admin/support"
```

---

### Task 10: Страница одного диалога — `/admin/support/[id]`

**Files:**
- Create: `src/app/(app)/admin/support/[id]/page.tsx`
- Create: `src/app/(app)/admin/support/[id]/_thread-view.tsx`

**Interfaces:**
- Consumes: `replyToThread`, `closeThread`, `markThreadRead` из `../actions` (Task 8).

- [ ] **Шаг 1: Написать серверную часть страницы**

`src/app/(app)/admin/support/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ThreadView } from "./_thread-view";

export const dynamic = "force-dynamic";

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");

  const { id } = await params;
  const thread = await db.supportThread.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { login: true, employee: { select: { fullName: true } } } } },
      },
    },
  });
  if (!thread) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Гость №${thread.seq}`}
        description={thread.phone ? `Присылал номер: ${thread.phone}` : "Номер телефона неизвестен."}
      />
      <ThreadView
        threadId={thread.id}
        status={thread.status}
        messages={thread.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          author: m.author?.employee?.fullName ?? m.author?.login ?? null,
        }))}
      />
    </div>
  );
}
```

- [ ] **Шаг 2: Написать клиентский компонент переписки**

`src/app/(app)/admin/support/[id]/_thread-view.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Textarea } from "@/components/ui";
import { closeThread, markThreadRead, replyToThread } from "../actions";

type Msg = {
  id: string;
  direction: "IN" | "OUT";
  body: string;
  createdAt: string;
  author: string | null;
};

export function ThreadView({
  threadId,
  status,
  messages,
}: {
  threadId: string;
  status: "OPEN" | "CLOSED";
  messages: Msg[];
}) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const markedRef = useRef(false);

  // Открыли диалог — отмечаем входящие прочитанными. Ref защищает от
  // повторного вызова при перерисовке в React Strict Mode.
  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    if (messages.some((m) => m.direction === "IN")) {
      void markThreadRead(threadId);
    }
  }, [threadId, messages]);

  function send() {
    setErr(null);
    start(async () => {
      const r = await replyToThread(threadId, text);
      if (r.error) setErr(r.error);
      else setText("");
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-[18px] bg-surface p-4 shadow-sm">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-muted">Сообщений пока нет.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.direction === "OUT" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm " +
                  (m.direction === "OUT" ? "bg-primary text-on-brand" : "bg-surface-muted text-ink")
                }
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p
                  className={
                    "mt-1 text-[11px] " + (m.direction === "OUT" ? "text-on-brand/70" : "text-ink-subtle")
                  }
                >
                  {m.direction === "OUT" ? (m.author ?? "C&B") : "Гость"} ·{" "}
                  {new Date(m.createdAt).toLocaleString("ru-RU")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {status === "CLOSED" && (
        <p className="text-sm text-ink-muted">Диалог закрыт. Если гость напишет снова, он откроется сам.</p>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ответ гостю…"
          disabled={pending}
        />
        {err && (
          <p className="text-sm font-medium text-danger" role="alert">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={send} loading={pending} disabled={!text.trim()}>
            Отправить
          </Button>
          {status === "OPEN" && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => start(async () => { await closeThread(threadId); })}
            >
              Закрыть диалог
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Шаг 3: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 4: Коммит**

```bash
git add "src/app/(app)/admin/support/[id]"
git commit -m "feat(support): страница переписки /admin/support/[id]"
```

---

### Task 11: Пункт меню и счётчик непрочитанных

**Files:**
- Modify: `src/app/(app)/_nav.ts`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `can(roles, "support.manage")` (Task 2).
- Produces: пункт «Чат поддержки» в меню «Ещё» и на плитках «Кабинета» (переиспользует общий список из `_nav.ts`, который уже используют обе поверхности — см. коммит `50f7dc0`).

- [ ] **Шаг 1: Добавить иконку**

В `src/app/(app)/_nav.ts`, в объект `ICONS`, после строки
`history: "M3 12a9 9 0 1 0 3-6.7L3 8||M3 3v5h5||M12 8v5l3 2",`, добавь:

```ts
  chat: "M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z||M8 9h8||M8 12h5",
```

- [ ] **Шаг 2: Добавить поле в `NavBadges`**

В типе `NavBadges`, после `feedback?: number;`, добавь:

```ts
  support?: number;
```

- [ ] **Шаг 3: Добавить пункт меню**

В `buildNavGroups`, сразу после блока:

```ts
  if (canManageFeedback)
    add("admin", "Аналитика и доступ", {
      href: "/admin/feedback",
      label: "Обратная связь",
      desc: "обращения сотрудников по программе льгот",
      icon: ICONS.inbox,
      badge: b.feedback || undefined,
    });
```

добавь:

```ts
  if (can(roles, "support.manage"))
    add("admin", "Аналитика и доступ", {
      href: "/admin/support",
      label: "Чат поддержки",
      desc: "когда бот не смог опознать человека при входе",
      icon: ICONS.chat,
      badge: b.support || undefined,
    });
```

- [ ] **Шаг 4: Посчитать непрочитанные в `layout.tsx`**

В `src/app/(app)/layout.tsx` найди:

```ts
  const canManageFeedback = can(roles, "feedback.manage");
```

Сразу под ней добавь:

```ts
  const canManageSupport = can(roles, "support.manage");
```

Найди блок `Promise.all`:

```ts
  const [
    pendingReview,
    pendingCoupons,
    pendingAdRequests,
    myCouponsReady,
    partnerCouponsReady,
    pendingFeedback,
  ] = await Promise.all([
    canDecide ? db.applicationItem.count({ where: { status: "PENDING" } }) : 0,
    canManageCoupons ? db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }) : 0,
    canManageCards ? db.advertisingRequest.count({ where: { status: "PENDING" } }) : 0,
    session.employee
      ? db.coupon.count({ where: { employeeId: session.employee.id, status: "ISSUED" } })
      : 0,
    canConfirmCoupons && partnerId
      ? db.coupon.count({ where: { partnerId, status: "ISSUED" } })
      : 0,
    canManageFeedback ? db.feedback.count({ where: { status: "NEW" } }) : 0,
  ]);
```

Замени на:

```ts
  const [
    pendingReview,
    pendingCoupons,
    pendingAdRequests,
    myCouponsReady,
    partnerCouponsReady,
    pendingFeedback,
    pendingSupport,
  ] = await Promise.all([
    canDecide ? db.applicationItem.count({ where: { status: "PENDING" } }) : 0,
    canManageCoupons ? db.applicationItem.count({ where: { status: "APPROVED", coupon: null } }) : 0,
    canManageCards ? db.advertisingRequest.count({ where: { status: "PENDING" } }) : 0,
    session.employee
      ? db.coupon.count({ where: { employeeId: session.employee.id, status: "ISSUED" } })
      : 0,
    canConfirmCoupons && partnerId
      ? db.coupon.count({ where: { partnerId, status: "ISSUED" } })
      : 0,
    canManageFeedback ? db.feedback.count({ where: { status: "NEW" } }) : 0,
    canManageSupport
      ? db.supportThread.count({ where: { messages: { some: { direction: "IN", readAt: null } } } })
      : 0,
  ]);
```

Найди вызов `buildNavGroups`:

```ts
    badges: {
      review: pendingReview,
      coupons: pendingCoupons,
      adRequests: pendingAdRequests,
      myCoupons: myCouponsReady,
      partnerCoupons: partnerCouponsReady,
      feedback: pendingFeedback,
    },
```

Замени на:

```ts
    badges: {
      review: pendingReview,
      coupons: pendingCoupons,
      adRequests: pendingAdRequests,
      myCoupons: myCouponsReady,
      partnerCoupons: partnerCouponsReady,
      feedback: pendingFeedback,
      support: pendingSupport,
    },
```

- [ ] **Шаг 5: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 6: Коммит**

```bash
git add "src/app/(app)/_nav.ts" "src/app/(app)/layout.tsx"
git commit -m "feat(support): пункт меню «Чат поддержки» со счётчиком непрочитанных"
```

---

### Task 12: Подписи в журнале аудита

**Files:**
- Modify: `src/app/(app)/admin/audit/page.tsx`

**Interfaces:**
- Не производит ничего для кода — только читаемость существующего раздела «Аудит».

- [ ] **Шаг 1: Добавить действия в `ACTION_LABELS`**

После строки `RBAC_MATRIX_CHANGED: "Изменена матрица прав",` добавь:

```ts
  SUPPORT_REPLY_SENT: "Ответ в чате поддержки",
  SUPPORT_THREAD_CLOSED: "Диалог поддержки закрыт",
```

- [ ] **Шаг 2: Добавить сущность в `ENTITY_LABELS`**

После строки `BenefitCard: "Карточка льготы",` добавь:

```ts
  SupportThread: "Диалог поддержки",
```

- [ ] **Шаг 3: Проверить**

```bash
npm run typecheck && npm run lint
```

- [ ] **Шаг 4: Коммит**

```bash
git add "src/app/(app)/admin/audit/page.tsx"
git commit -m "chore(audit): подписи для действий чата поддержки"
```

---

### Task 13: Сквозная проверка вручную

**Files:** нет (только проверка уже написанного).

- [ ] **Шаг 1: Убедиться, что дев-сервер поднят**

```bash
curl.exe -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
```

Ожидается: `200`. Если не запущен — `npm run dev` в отдельном терминале
(или через `preview_start`, если доступен инструмент браузера).

- [ ] **Шаг 2: Имитировать нажатие кнопки «Написать администратору»**

Взять `TELEGRAM_WEBHOOK_SECRET` из `.env` и отправить callback_query для
тестового `telegramId` (используй заведомо не занятый ничем ID, например
`999000111`, чтобы не задеть настоящие учётки):

```bash
SECRET=$(grep -E "^TELEGRAM_WEBHOOK_SECRET" .env | sed -E 's/^TELEGRAM_WEBHOOK_SECRET="?//; s/"$//')
curl.exe -s -X POST "http://localhost:3000/api/telegram" \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: $SECRET" \
  -d '{"callback_query":{"id":"test1","from":{"id":999000111},"message":{"chat":{"id":999000111}},"data":"support:start"}}'
```

Ожидается: `{"ok":true}`. Это дёрнет настоящий Telegram API
(`answerCallbackQuery` + `sendMessage`) — на несуществующий chat_id
`999000111` Telegram ответит ошибкой доставки, но обработчик её проглотит
(`sendTelegram`/`tg()` не бросают исключений при неудаче) — это ожидаемо,
цель шага — проверить, что тред создался в базе, а не что сообщение
реально дошло куда-то.

- [ ] **Шаг 3: Проверить, что тред создался**

```bash
cat > scripts/_tmp-verify-support.ts <<'EOF'
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
async function main() {
  const db = new PrismaClient();
  const t = await db.supportThread.findUnique({ where: { telegramId: "999000111" } });
  console.log("тред:", JSON.stringify(t, null, 2));
  await db.$disconnect();
}
main();
EOF
npx tsx scripts/_tmp-verify-support.ts
```

Ожидается: объект с `status: "OPEN"`, `telegramId: "999000111"`.

- [ ] **Шаг 4: Имитировать сообщение гостя**

```bash
curl.exe -s -X POST "http://localhost:3000/api/telegram" \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: $SECRET" \
  -d '{"message":{"chat":{"id":999000111},"from":{"id":999000111},"text":"Здравствуйте, у меня не получается войти"}}'
```

Затем повторно:

```bash
npx tsx scripts/_tmp-verify-support.ts
```

Дополнить скрипт (или запустить отдельно) проверкой сообщений:

```bash
cat >> scripts/_tmp-verify-support.ts <<'EOF'
EOF
cat > scripts/_tmp-verify-support2.ts <<'EOF'
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
async function main() {
  const db = new PrismaClient();
  const t = await db.supportThread.findUnique({
    where: { telegramId: "999000111" },
    include: { messages: true },
  });
  console.log(JSON.stringify(t, null, 2));
  await db.$disconnect();
}
main();
EOF
npx tsx scripts/_tmp-verify-support2.ts
```

Ожидается: `messages` содержит одну запись с `direction: "IN"` и текстом
сообщения.

- [ ] **Шаг 5: Проверить страницу списка глазами**

Открой `http://localhost:3000/admin/support` под учёткой с ролью C&B.
Ожидается: строка «Гость №<N>» с бейджем непрочитанных «1» и превью
последнего сообщения.

- [ ] **Шаг 6: Ответить из интерфейса**

Открой диалог, введи любой текст, нажми «Отправить». Ожидается: сообщение
появляется в ленте справа (как «Вы»), поле ввода очищается. Проверить в
базе, что `SupportMessage` с `direction: "OUT"` появился и `readAt` у
входящего сообщения проставился:

```bash
npx tsx scripts/_tmp-verify-support2.ts
```

- [ ] **Шаг 7: Закрыть диалог и убедиться, что переоткрывается**

Нажать «Закрыть диалог» — статус на странице должен смениться на «Диалог
закрыт». Затем повторить Шаг 4 (ещё одно сообщение от того же
`telegramId`) и снова Шаг 3/5 — `status` должен вернуться в `OPEN`, а
список — снова показывать этот тред открытым.

- [ ] **Шаг 8: Убрать тестовые данные**

```bash
cat > scripts/_tmp-cleanup-support.ts <<'EOF'
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
async function main() {
  const db = new PrismaClient();
  const t = await db.supportThread.findUnique({ where: { telegramId: "999000111" } });
  if (t) {
    await db.supportMessage.deleteMany({ where: { threadId: t.id } });
    await db.supportThread.delete({ where: { id: t.id } });
    console.log("тестовый тред удалён");
  }
  await db.$disconnect();
}
main();
EOF
npx tsx scripts/_tmp-cleanup-support.ts
rm -f scripts/_tmp-verify-support.ts scripts/_tmp-verify-support2.ts scripts/_tmp-cleanup-support.ts
```

- [ ] **Шаг 9: Финальная проверка всего проекта**

```bash
npm run typecheck && npm run lint
```

Ожидается: без ошибок. Коммитить здесь нечего (весь код закоммичен по
задачам выше) — это последняя сверка перед тем, как отдать фичу
пользователю.
