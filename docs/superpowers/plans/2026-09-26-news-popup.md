# Новости (попап + лента + рассылка в бот) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админ создаёт новость (заголовок + форматированный текст + фото + аудитория), публикует её, опционально шлёт как сообщение в Telegram-бот со ссылкой на сайт; сотрудник видит непрочитанные новости попапом на витрине (по одной за вход) и может открыть ленту всех новостей.

**Architecture:** Два новых Prisma-модели (`News`, `NewsRead`). Админ-форма и попап переиспользуют уже существующие в проекте компоненты: `RichTextarea`/`FormattedText` (форматирование), `ImageUploadField` (Vercel Blob, новый `purpose: "news"`), `TranslationFields` (tg/uz), `resolveAudience`/`SEGMENTS`/`BroadcastForm`-паттерн (таргетинг), очередь `Notification` + `flushTelegram()` (доставка в бот, событие `BROADCAST` как есть — текст новости идёт через тот же `{text}`-плейсхолдер, что и обычная рассылка). Показ попапа: сервер в `(app)/layout.tsx` один раз вычисляет самую старую непрочитанную подходящую по аудитории новость и передаёт её клиентскому компоненту; кнопка «Понятно» пишет `NewsRead` через server action, кнопка «X» — только `sessionStorage` на клиенте.

**Tech Stack:** Next.js 16 (App Router, Server Actions, Turbopack), Prisma 6 + PostgreSQL (Supabase pooler), Vercel Blob, Telegram Bot API (уже подключённый конвейер `Notification`/`deliverTelegramNotifications`).

**Spec:** [docs/superpowers/specs/2026-09-26-news-popup-design.md](../specs/2026-09-26-news-popup-design.md)

## Global Constraints

- Сотрудник = `User` с непустым `employee` (см. `(app)/layout.tsx:53` — ветка `AppShell` рендерится только когда `session.employee` есть). Кассиры (`CONTRACTOR`) не имеют `Employee` и физически не попадают в эту ветку — отдельной проверки роли не требуется.
- Право доступа к разделу «Новости» в админке — то же, что у «Рассылок»: `cards.manage` (`assertCan(session.roles, "cards.manage")`).
- Никаких новых записей в типизированный i18n-словарь (`src/lib/i18n/dict.ts`, тип `TKey`) не добавляем — все новые подписи в UI пишутся как обычные русские строки-литералы (так уже сделано для хоткеев `RichTextarea` в этой же сессии). Единственное существующее использование `t()` — там, где код уже его использует (не трогаем).
- Тестового раннера (vitest/jest) в проекте нет — проверка каждой задачи выполняется через `npx tsc --noEmit` (типы) и ручную проверку в браузере превью (`preview_start` → `navigate` → `read_page`/`screenshot`), как это делалось в текущей сессии. Каждая задача заканчивается таким ручным шагом вместо unit-теста.
- Миграция Prisma (`npm run db:migrate`) требует рабочего сетевого подключения к `DATABASE_URL`/`DIRECT_URL` (см. `.env` — Supabase pooler, у сессии уже была нестабильность сети). Если миграция падает с `Can't reach database server` — это сеть, не код; повторить, когда соединение стабильно.
- Формат `News.audience`: `{ department?: string; position?: string } | null`. Пустое/`null` = все действующие сотрудники. Ровно тот же смысл, что у `department`/`position` в `AudienceFilters` (`src/lib/broadcast-audience.ts`), сегмент всегда фиксирован как `"ALL"` (воронки `NOT_REGISTERED`/`NEVER_LOGGED_IN`/`NO_CHOICE` к новостям не относятся и не используются).
- Разметка `News.title`/`News.body` — тот же markdown-подобный синтаксис, что у `Partner.terms` (`**bold**`, `_italic_`, `__underline__`, `~~strike~~`, `# heading`), рендерится компонентом `FormattedText` (`src/components/formatted-text.tsx`, уже существует).

---

## Task 1: Схема БД — модели News и NewsRead

**Files:**
- Modify: `prisma/schema.prisma:190` (добавить `newsReads NewsRead[]` в `model User`)
- Modify: `prisma/schema.prisma` (добавить два новых блока `model News` / `model NewsRead` рядом с `TextBlock`, перед `NotificationTemplate`, т.е. после строки 726)

**Interfaces:**
- Produces: Prisma-модели `News { id, title, body, imageUrl, status, audience, translations, publishedAt, telegramSentAt, createdAt, updatedAt }` и `NewsRead { id, newsId, userId, readAt }`, доступные как `db.news` / `db.newsRead` во всех последующих задачах.

- [ ] **Step 1: Добавить реляционное поле на `User`**

В `prisma/schema.prisma` в `model User` (рядом со строкой `notifications   Notification[]`, см. текущую строку 190) добавить:

```prisma
  newsReads       NewsRead[]
```

- [ ] **Step 2: Добавить модели News и NewsRead**

Сразу после `model TextBlock { ... }` (после закрывающей `}` на строке 726) вставить:

```prisma
/// Новости: попап на витрине сотрудника + лента + рассылка в Telegram.
model News {
  id             String     @id @default(cuid())
  title          String
  /// Markdown-подобная разметка — см. FormattedText.
  body           String
  imageUrl       String?
  status         String     @default("DRAFT") // DRAFT | PUBLISHED
  /// { department?, position? } — тот же смысл, что AudienceFilters в рассылках. null/{} = все сотрудники.
  audience       Json?
  /// { tg?: { title?, body? }, uz?: { ... } } — см. Partner.translations.
  translations   Json?
  publishedAt    DateTime?
  telegramSentAt DateTime?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  reads          NewsRead[]

  @@index([status, publishedAt])
}

/// Факт прочтения новости конкретным сотрудником — пишется только по кнопке
/// «Понятно». Закрытие крестиком в NewsRead не попадает (см. спеку).
model NewsRead {
  id     String   @id @default(cuid())
  newsId String
  userId String
  readAt DateTime @default(now())

  news News @relation(fields: [newsId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([newsId, userId])
  @@index([userId])
}
```

- [ ] **Step 3: Прогнать миграцию**

Run: `npm run db:migrate -- --name add_news`
Expected: Prisma создаёт файл миграции в `prisma/migrations/`, применяет её к БД, печатает `Your database is now in sync with your schema.`, и перегенерирует `@prisma/client`. Если упадёт с сетевой ошибкой (`Can't reach database server`) — повторить позже, это не связано с содержимым миграции.

- [ ] **Step 4: Проверить типы**

Run: `npx tsc --noEmit -p .`
Expected: без ошибок (`db.news`/`db.newsRead` теперь существуют в сгенерированном клиенте).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): модели News и NewsRead"
```

---

## Task 2: Новый purpose загрузки изображений — "news"

**Files:**
- Modify: `src/lib/blob-upload.ts:19`
- Modify: `src/app/(app)/_components/image-upload-field.tsx:18`
- Modify: `src/app/api/blob/upload/route.ts:30-33,110-119,153-175`

**Interfaces:**
- Consumes: ничего нового — расширяет существующий union-тип.
- Produces: `ImageUploadField` теперь принимает `purpose="news"`, роут `/api/blob/upload` принимает `purpose=news` в `multipart/form-data` и проверяет право `cards.manage`.

- [ ] **Step 1: Расширить тип в blob-upload.ts**

В `src/lib/blob-upload.ts` строка 19:

```ts
export type UploadPurpose = "card" | "banner" | "news";
```

- [ ] **Step 2: Расширить тип в image-upload-field.tsx**

В `src/app/(app)/_components/image-upload-field.tsx` строка 18:

```ts
type Purpose = "card" | "banner" | "news";
```

- [ ] **Step 3: Разрешить purpose "news" в роуте загрузки**

В `src/app/api/blob/upload/route.ts` заменить блок (строки 30-33):

```ts
const PURPOSE_PERMISSION: Record<string, Permission> = {
  card: "cards.manage",
  banner: "partners.manage",
};
```

на:

```ts
const PURPOSE_PERMISSION: Record<string, Permission> = {
  card: "cards.manage",
  banner: "partners.manage",
  news: "cards.manage",
};
```

- [ ] **Step 4: Поправить аудит-лейблы под новый purpose**

В том же файле заменить оба одинаковых тернарника (строки 112-116 и 170-171) на функцию с тремя ветками. Сначала добавить helper прямо над `POST` (после `noStoreConfigured`, перед `export async function POST`):

```ts
function auditLabelsFor(purpose: string): { action: string; entityType: string } {
  if (purpose === "banner") return { action: "BANNER_IMAGE_UPLOADED", entityType: "PartnerBanner" };
  if (purpose === "news") return { action: "NEWS_IMAGE_UPLOADED", entityType: "News" };
  return { action: "CARD_IMAGE_UPLOADED", entityType: "BenefitCard" };
}
```

Затем заменить (строки 110-119):

```ts
      await audit({
        actorId: s.user.id,
        action:
          purpose === "banner"
            ? "BANNER_IMAGE_UPLOADED"
            : "CARD_IMAGE_UPLOADED",
        entityType: purpose === "banner" ? "PartnerBanner" : "BenefitCard",
        entityId: "-",
        newValue: { url: blob.url },
      });
```

на:

```ts
      await audit({
        actorId: s.user.id,
        ...auditLabelsFor(purpose),
        entityId: "-",
        newValue: { url: blob.url },
      });
```

И заменить (строки 167-175):

```ts
        if (userId) {
          await audit({
            actorId: userId,
            action: purpose === "banner" ? "BANNER_IMAGE_UPLOADED" : "CARD_IMAGE_UPLOADED",
            entityType: purpose === "banner" ? "PartnerBanner" : "BenefitCard",
            entityId: "-",
            newValue: { url: blob.url },
          });
        }
```

на:

```ts
        if (userId) {
          await audit({ actorId: userId, ...auditLabelsFor(purpose), entityId: "-", newValue: { url: blob.url } });
        }
```

- [ ] **Step 5: Проверить типы**

Run: `npx tsc --noEmit -p .`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/lib/blob-upload.ts "src/app/(app)/_components/image-upload-field.tsx" src/app/api/blob/upload/route.ts
git commit -m "feat(upload): purpose \"news\" для фото новости"
```

---

## Task 3: Server actions новостей — черновик, публикация, отправка в бот

**Files:**
- Create: `src/app/(admin)/admin/news/actions.ts`
- Test (ручная проверка): через форму из Task 4 — этот таск только код действий, UI ещё нет, поэтому проверяется типами и позже через форму.

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `requireSession`/`assertCan` (`@/lib/auth`, `@/lib/rbac`), `audit` (`@/lib/audit`), `flushTelegram`, `formatNotificationText`, `templateMapFromRows` (`@/lib/notify`, `@/lib/notification-format`), `resolveAudience`, `type AudienceFilters` (`@/lib/broadcast-audience`), `revalidatePath` (`next/cache`).
- Produces:
  - `type NewsFormState = { success?: true; newsId?: string; error?: string }`
  - `saveNews(prev: NewsFormState, formData: FormData): Promise<NewsFormState>` — создаёт (если нет `id`) или обновляет черновик.
  - `publishNews(id: string): Promise<{ error?: string } | undefined>`
  - `sendNewsToBot(id: string): Promise<{ error?: string; sent?: number } | undefined>`

- [ ] **Step 1: Написать actions.ts**

Создать `src/app/(admin)/admin/news/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { flushTelegram } from "@/lib/notify";
import { resolveAudience } from "@/lib/broadcast-audience";
import { templateMapFromRows, formatNotificationText } from "@/lib/notification-format";
import { platformUrl } from "@/lib/platform-url";

export type NewsFormState = { success?: true; newsId?: string; error?: string };

function readTranslations(formData: FormData): unknown {
  const raw = String(formData.get("translations") ?? "");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Создаёт или обновляет черновик новости. `id` в formData — редактирование, иначе — создание. */
export async function saveNews(_prev: NewsFormState, formData: FormData): Promise<NewsFormState> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim();

  if (!title) return { error: "Введите заголовок новости." };
  if (!body) return { error: "Введите текст новости." };

  const audience = department || position ? { department: department || undefined, position: position || undefined } : null;
  const translations = readTranslations(formData);

  const data = { title, body, imageUrl, audience: audience ?? undefined, translations };

  const news = id
    ? await db.news.update({ where: { id }, data })
    : await db.news.create({ data });

  await audit({
    actorId: session.user.id,
    action: id ? "NEWS_UPDATED" : "NEWS_CREATED",
    entityType: "News",
    entityId: news.id,
    newValue: { title, department, position },
  });

  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${news.id}`);
  return { success: true, newsId: news.id };
}

/** Публикует черновик — с этого момента новость видна в попапе и в ленте. */
export async function publishNews(id: string): Promise<{ error?: string } | undefined> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const news = await db.news.findUnique({ where: { id }, select: { status: true } });
  if (!news) return { error: "Новость не найдена." };
  if (news.status === "PUBLISHED") return { error: "Новость уже опубликована." };

  await db.news.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await audit({ actorId: session.user.id, action: "NEWS_PUBLISHED", entityType: "News", entityId: id });

  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${id}`);
  revalidatePath("/news");
}

/** Отправляет новость как сообщение в Telegram-бот (событие BROADCAST, текст = заголовок + текст + ссылка). */
export async function sendNewsToBot(id: string): Promise<{ error?: string; sent?: number } | undefined> {
  const session = await requireSession();
  assertCan(session.roles, "cards.manage");

  const news = await db.news.findUnique({ where: { id } });
  if (!news) return { error: "Новость не найдена." };
  if (news.status !== "PUBLISHED") return { error: "Сначала опубликуйте новость." };

  const filters = {
    segment: "ALL" as const,
    department: (news.audience as { department?: string } | null)?.department ?? "",
    position: (news.audience as { position?: string } | null)?.position ?? "",
    q: "",
  };
  const audience = await resolveAudience(filters);
  if (audience.error) return { error: audience.error };
  if (audience.users.length === 0) return { error: "Нет получателей по аудитории этой новости." };

  const siteUrl = platformUrl() || "";
  const link = siteUrl ? `\n\n${siteUrl}/news/${news.id}` : "";
  const plainBody = news.body.replace(/[*_~#]/g, "");
  const text = `${news.title}\n\n${plainBody}${link}`;

  await db.notification.createMany({
    data: audience.users.map((u) => ({
      userId: u.id,
      event: "BROADCAST",
      channel: "TELEGRAM",
      payload: { text },
    })),
  });
  flushTelegram();

  await db.news.update({ where: { id }, data: { telegramSentAt: new Date() } });
  await audit({
    actorId: session.user.id,
    action: "NEWS_SENT_TO_BOT",
    entityType: "News",
    entityId: id,
    newValue: { recipients: audience.users.length },
  });

  revalidatePath(`/admin/news/${id}`);
  return { sent: audience.users.length };
}
```

Примечание: `templateMapFromRows`/`formatNotificationText` импортированы в описании интерфейса, но в этой реализации не нужны — текст собирается напрямую (короче, без правки шаблона `BROADCAST` из админки, т.к. `BROADCAST`-шаблон уже применяется получателем на этапе доставки бота через `deliverTelegramNotifications`, которая сама берёт `payload.text` и оборачивает его в шаблон `BROADCAST` — см. `notification-format.ts:150-153`, `body: "📢 <b>Объявление</b>\n{text}"`). Уберите неиспользуемые импорты `templateMapFromRows`, `formatNotificationText` из финального файла (Step 1 выше уже их не использует — просто не добавляйте эти два импорта при копировании кода, если IDE подсветит их как лишние).

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit -p .`
Expected: без ошибок. Если ругается на неиспользуемые импорты `templateMapFromRows`/`formatNotificationText` — удалить их из списка импортов (они не нужны, см. примечание в Step 1).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/news/actions.ts"
git commit -m "feat(news): server actions — черновик, публикация, отправка в бот"
```

---

## Task 4: Админ — список и форма новости

**Files:**
- Create: `src/app/(admin)/admin/news/page.tsx`
- Create: `src/app/(admin)/admin/news/_form.tsx`
- Create: `src/app/(admin)/admin/news/new/page.tsx`
- Create: `src/app/(admin)/admin/news/[id]/page.tsx`
- Modify: `src/app/(app)/_nav.ts:157-169` (добавить пункт «Новости» в группу `catalog`)

**Interfaces:**
- Consumes: `saveNews`, `publishNews`, `sendNewsToBot` (Task 3), `RichTextarea` (`@/components/rich-textarea`), `FormattedText` (`@/components/formatted-text`), `ImageUploadField` (`@/app/(app)/_components/image-upload-field`), `TranslationFields` (`@/components/translation-fields`), `Field/Input/Select/Button/Table/Badge/buttonClass` (`@/components/ui`).
- Produces: страницы `/admin/news`, `/admin/news/new`, `/admin/news/[id]`.

- [ ] **Step 1: Форма новости (общая для создания и редактирования)**

Создать `src/app/(admin)/admin/news/_form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Select, buttonClass } from "@/components/ui";
import { RichTextarea } from "@/components/rich-textarea";
import { FormattedText } from "@/components/formatted-text";
import { ImageUploadField } from "@/app/(app)/_components/image-upload-field";
import { TranslationFields } from "@/components/translation-fields";
import type { Locale } from "@/lib/i18n/shared";
import { saveNews, type NewsFormState } from "./actions";

const NEWS_TRANSLATION_FIELDS = [
  { name: "title", label: "Заголовок" },
  { name: "body", label: "Текст", multiline: true },
];

export type NewsValues = {
  id?: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audience?: { department?: string; position?: string } | null;
  translations?: Partial<Record<"tg" | "uz", Record<string, string>>> | null;
};

export function NewsForm({
  initial,
  departments,
  positions,
  locale,
}: {
  initial?: NewsValues;
  departments: string[];
  positions: string[];
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState<NewsFormState, FormData>(saveNews, {});
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Заголовок" htmlFor="title" required>
        <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>

      <Field
        label="Текст"
        htmlFor="body"
        hint="Ctrl+B — жирный, Ctrl+I — курсив, Ctrl+U — подчёркнутый, Ctrl+Shift+X — зачёркнутый, Ctrl+Alt+1 — заголовок строки"
      >
        <RichTextarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
      </Field>
      {body.trim() && (
        <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">Предпросмотр</p>
          <div className="mt-1.5 text-sm leading-6 text-ink">
            <FormattedText text={body} />
          </div>
        </div>
      )}

      <ImageUploadField
        value={imageUrl}
        onChange={setImageUrl}
        purpose="news"
        label="Фото новости"
        locale={locale}
      />
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <p className="pt-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Кому показывать</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Отдел" htmlFor="department" hint="Не выбрано — все отделы">
          <Select id="department" name="department" defaultValue={initial?.audience?.department ?? ""}>
            <option value="">Все отделы</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Должность" htmlFor="position" hint="Не выбрано — все должности">
          <Select id="position" name="position" defaultValue={initial?.audience?.position ?? ""}>
            <option value="">Все должности</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>
      </div>

      <TranslationFields fields={NEWS_TRANSLATION_FIELDS} initial={initial?.translations} />

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={pending}>Сохранить черновик</Button>
        {initial?.id && (
          <Link href={`/admin/news/${initial.id}`} className={buttonClass({ variant: "secondary" })}>
            Отмена
          </Link>
        )}
      </div>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.success && state.newsId && !initial?.id && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Черновик сохранён.{" "}
          <Link href={`/admin/news/${state.newsId}`} className="underline">
            Перейти к публикации →
          </Link>
        </p>
      )}
      {state.success && initial?.id && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Сохранено.
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Страница создания**

Создать `src/app/(admin)/admin/news/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale } from "@/lib/i18n";
import { NewsForm } from "../_form";

export default async function NewNewsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();

  const [departments, positions] = await Promise.all([
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { position: true },
      distinct: ["position"],
      orderBy: { position: "asc" },
    }),
  ]);

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">Новая новость</h1>
      <NewsForm
        departments={departments.map((d) => d.department)}
        positions={positions.map((p) => p.position)}
        locale={locale}
      />
    </div>
  );
}
```

- [ ] **Step 3: Страница редактирования + публикация + отправка в бот**

Создать `src/app/(admin)/admin/news/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale } from "@/lib/i18n";
import { NewsForm } from "../_form";
import { NewsPublishActions } from "./_publish-actions";

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const { id } = await params;
  const locale = await getLocale();

  const [news, departments, positions] = await Promise.all([
    db.news.findUnique({ where: { id } }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { position: true },
      distinct: ["position"],
      orderBy: { position: "asc" },
    }),
  ]);
  if (!news) notFound();

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{news.title}</h1>
        <NewsPublishActions
          id={news.id}
          status={news.status}
          telegramSentAt={news.telegramSentAt ? news.telegramSentAt.toISOString() : null}
        />
      </div>
      <NewsForm
        initial={{
          id: news.id,
          title: news.title,
          body: news.body,
          imageUrl: news.imageUrl,
          audience: news.audience as { department?: string; position?: string } | null,
          translations: news.translations as Partial<Record<"tg" | "uz", Record<string, string>>> | null,
        }}
        departments={departments.map((d) => d.department)}
        positions={positions.map((p) => p.position)}
        locale={locale}
      />
    </div>
  );
}
```

- [ ] **Step 4: Кнопки «Опубликовать» / «Отправить в бот»**

Создать `src/app/(admin)/admin/news/[id]/_publish-actions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { publishNews, sendNewsToBot } from "../actions";

export function NewsPublishActions({
  id,
  status,
  telegramSentAt,
}: {
  id: string;
  status: string;
  telegramSentAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Badge tone={status === "PUBLISHED" ? "success" : "neutral"}>
          {status === "PUBLISHED" ? "Опубликовано" : "Черновик"}
        </Badge>
        {status === "DRAFT" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await publishNews(id);
                if (r?.error) setError(r.error);
                else router.refresh();
              });
            }}
          >
            Опубликовать
          </Button>
        )}
        {status === "PUBLISHED" && !telegramSentAt && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await sendNewsToBot(id);
                if (r?.error) setError(r.error);
                else {
                  setSent(r?.sent ?? 0);
                  router.refresh();
                }
              });
            }}
          >
            Отправить в бот
          </Button>
        )}
        {telegramSentAt && (
          <span className="text-xs text-ink-muted">
            В боте с {new Date(telegramSentAt).toLocaleString("ru-RU")}
          </span>
        )}
      </div>
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
      {sent != null && <span className="text-xs font-medium text-success-strong">Отправлено: {sent}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Список новостей**

Создать `src/app/(admin)/admin/news/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Table, buttonClass, type BadgeTone } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = { PUBLISHED: "success", DRAFT: "neutral" };
const STATUS_LABEL: Record<string, string> = { PUBLISHED: "Опубликовано", DRAFT: "Черновик" };

export default async function NewsListPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");

  const news = await db.news.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, title: true, status: true, publishedAt: true, telegramSentAt: true, createdAt: true },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink">Новости</h1>
        <Link href="/admin/news/new" className={buttonClass({ size: "sm" })}>
          Добавить новость
        </Link>
      </div>

      <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
        <Table stickyHeader>
          <thead>
            <tr>
              <th>Заголовок</th>
              <th>Статус</th>
              <th>Опубликована</th>
              <th>В боте</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {news.map((n) => (
              <tr key={n.id}>
                <td className="font-medium text-ink">{n.title}</td>
                <td>
                  <Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{STATUS_LABEL[n.status] ?? n.status}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                  {n.publishedAt ? n.publishedAt.toLocaleDateString("ru-RU") : "—"}
                </td>
                <td className="whitespace-nowrap text-xs text-ink-muted" data-numeric>
                  {n.telegramSentAt ? n.telegramSentAt.toLocaleDateString("ru-RU") : "—"}
                </td>
                <td>
                  <div className="flex justify-end">
                    <Link href={`/admin/news/${n.id}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                      Открыть
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Пункт меню «Новости» в каталоге админки**

В `src/app/(app)/_nav.ts` сразу после блока `if (canManageCards) add("catalog", ...)` для `/admin/cards` (строки 156-162) добавить:

```ts
  if (canManageCards)
    add("catalog", t("nav.catalog"), {
      href: "/admin/news",
      label: "Новости",
      desc: "объявления с попапом на витрине и рассылкой в бот",
      icon: ICONS.bell,
    });
```

- [ ] **Step 7: Проверить типы**

Run: `npx tsc --noEmit -p .`
Expected: без ошибок.

- [ ] **Step 8: Ручная проверка в браузере**

1. `preview_start` (конфиг `dev` из `.claude/launch.json`).
2. Войти в админку под ролью с `cards.manage` (C_AND_B).
3. Открыть `/admin/news` → «Добавить новость» → заполнить заголовок/текст (попробовать Ctrl+B) → «Сохранить черновик» → убедиться, что появилась ссылка «Перейти к публикации».
4. Перейти на `/admin/news/[id]` → нажать «Опубликовать» → бейдж должен смениться на «Опубликовано», появиться кнопка «Отправить в бот».
5. Проверить, что в списке `/admin/news` новость видна со статусом «Опубликовано».

- [ ] **Step 9: Commit**

```bash
git add "src/app/(admin)/admin/news" "src/app/(app)/_nav.ts"
git commit -m "feat(news): админка — список, создание, публикация, отправка в бот"
```

---

## Task 5: Попап на витрине сотрудника

**Files:**
- Create: `src/app/(app)/_news-actions.ts`
- Create: `src/app/(app)/_news-popup.tsx`
- Create: `src/app/(app)/_news-query.ts`
- Modify: `src/app/(app)/layout.tsx:1-133` (добавить вычисление и рендер попапа в ветке `AppShell`)

**Interfaces:**
- Consumes: `db`, `getSession` (уже импортированы в `layout.tsx`).
- Produces: `getPendingNewsFor(userId: string, employee: { department: string; position: string }): Promise<PendingNews | null>` (тип `PendingNews = { id: string; title: string; body: string; imageUrl: string | null }`), `markNewsRead(newsId: string): Promise<void>`, компонент `<NewsPopup news={PendingNews} />`.

- [ ] **Step 1: Запрос непрочитанной новости по аудитории**

Создать `src/app/(app)/_news-query.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";

export type PendingNews = { id: string; title: string; body: string; imageUrl: string | null };

type Audience = { department?: string; position?: string } | null;

function matches(audience: Audience, employee: { department: string; position: string }): boolean {
  if (!audience) return true;
  if (audience.department && audience.department !== employee.department) return false;
  if (audience.position && audience.position !== employee.position) return false;
  return true;
}

/** Самая старая опубликованная новость, которую этот сотрудник ещё не отметил «Понятно». */
export async function getPendingNewsFor(
  userId: string,
  employee: { department: string; position: string },
): Promise<PendingNews | null> {
  const candidates = await db.news.findMany({
    where: { status: "PUBLISHED", reads: { none: { userId } } },
    orderBy: { publishedAt: "asc" },
    select: { id: true, title: true, body: true, imageUrl: true, audience: true },
  });
  const hit = candidates.find((n) => matches(n.audience as Audience, employee));
  if (!hit) return null;
  return { id: hit.id, title: hit.title, body: hit.body, imageUrl: hit.imageUrl };
}
```

- [ ] **Step 2: Server action «Понятно»**

Создать `src/app/(app)/_news-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

/** Помечает новость прочитанной для текущего пользователя (кнопка «Понятно»). */
export async function markNewsRead(newsId: string): Promise<void> {
  const session = await requireSession();
  await db.newsRead.upsert({
    where: { newsId_userId: { newsId, userId: session.user.id } },
    create: { newsId, userId: session.user.id },
    update: {},
  });
  revalidatePath("/");
}
```

- [ ] **Step 3: Компонент попапа**

Создать `src/app/(app)/_news-popup.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui";
import { FormattedText } from "@/components/formatted-text";
import { markNewsRead } from "./_news-actions";
import type { PendingNews } from "./_news-query";

const dismissKey = (id: string) => `news-dismissed:${id}`;

/**
 * Попап новости на витрине. «Понятно» — пишет NewsRead (больше не покажется
 * никогда). «X» — только sessionStorage этой вкладки: при новой вкладке/входе
 * попап снова появится, пока не нажмут «Понятно» (см. спеку).
 */
export function NewsPopup({ news }: { news: PendingNews }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(dismissKey(news.id))) return;
    } catch {
      /* приватный режим / storage недоступен — просто показываем попап */
    }
    setOpen(true);
  }, [news.id]);

  if (!open) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(news.id), "1");
    } catch {
      /* не критично — попап просто может показаться повторно в этой же вкладке */
    }
    setOpen(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold leading-snug text-ink">{news.title}</h3>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Закрыть"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {news.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={news.imageUrl} alt="" className="mt-3 w-full rounded-xl object-cover" />
        )}

        <div className="mt-3 text-sm leading-6 text-ink">
          <FormattedText text={news.body} />
        </div>

        <p className="mt-3 text-sm">
          <Link href={`/news/${news.id}`} className="font-semibold text-primary-strong hover:underline">
            Подробнее →
          </Link>
        </p>

        <Button
          fullWidth
          className="mt-5"
          loading={pending}
          onClick={() => {
            start(async () => {
              await markNewsRead(news.id);
              setOpen(false);
            });
          }}
        >
          Понятно
        </Button>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Подключить попап в layout**

В `src/app/(app)/layout.tsx` добавить импорты (рядом со строкой 11, после `import { SupportAlert } from "./_support-alert";`):

```ts
import { NewsPopup } from "./_news-popup";
import { getPendingNewsFor } from "./_news-query";
```

Внутри блока `if (session.employee)` (строки 83-94, где считается `selectionStat`) добавить рядом вычисление новости — заменить

```tsx
  let selectionStat: { used: number; drafts: number; max: number } | null = null;
  if (session.employee) {
```

на

```tsx
  let selectionStat: { used: number; drafts: number; max: number } | null = null;
  const pendingNews = session.employee
    ? await getPendingNewsFor(session.user.id, {
        department: session.employee.department,
        position: session.employee.position,
      })
    : null;
  if (session.employee) {
```

И в JSX (строки 112-132) добавить рендер попапа рядом с `<SupportAlert />`, заменив

```tsx
  return (
    <>
      {canManageSupport && <SupportAlert />}
      <AppShell
```

на

```tsx
  return (
    <>
      {canManageSupport && <SupportAlert />}
      {pendingNews && <NewsPopup news={pendingNews} />}
      <AppShell
```

- [ ] **Step 5: Проверить типы**

Run: `npx tsc --noEmit -p .`
Expected: без ошибок. Если `Employee` не содержит `department`/`position` с такими именами в типе сессии — свериться со строками, где `broadcast-audience.ts` уже читает `db.employee...department`/`position` (Task 3 `resolveAudience`) — поля точно существуют в модели `Employee`.

- [ ] **Step 6: Ручная проверка в браузере**

1. В админке опубликовать тестовую новость без аудитории (Task 4).
2. Зайти под учёткой сотрудника (с `Employee`) на `/` — попап должен появиться один раз.
3. Нажать «X» — попап исчезает; перезагрузить страницу (та же вкладка) — попап НЕ должен появиться снова (sessionStorage).
4. Открыть `/` в новой вкладке — попап должен появиться снова.
5. Нажать «Понятно» — попап исчезает; обновить/открыть новую вкладку — больше не появляется вовсе.
6. Опубликовать вторую новость с `department`, не совпадающим с отделом тестового сотрудника — попап НЕ должен появиться.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/_news-actions.ts" "src/app/(app)/_news-popup.tsx" "src/app/(app)/_news-query.ts" "src/app/(app)/layout.tsx"
git commit -m "feat(news): попап новости на витрине сотрудника"
```

---

## Task 6: Лента новостей на сайте

**Files:**
- Create: `src/app/(app)/news/page.tsx`
- Create: `src/app/(app)/news/[id]/page.tsx`
- Modify: `src/app/(app)/_nav.ts:87-114` (добавить пункт «Новости» в группу `cabinet`)

**Interfaces:**
- Consumes: `db`, `getSession` (стандартный паттерн страниц `(app)`), `FormattedText`.
- Produces: страницы `/news`, `/news/[id]`.

- [ ] **Step 1: Список новостей**

Создать `src/app/(app)/news/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export default async function NewsFeedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");

  const news = await db.news.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, body: true, imageUrl: true, publishedAt: true },
  });

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink">Новости</h1>
      {news.length === 0 && <p className="text-sm text-ink-muted">Пока новостей нет.</p>}
      <div className="space-y-3">
        {news.map((n) => (
          <Link
            key={n.id}
            href={`/news/${n.id}`}
            className="block rounded-2xl border border-line-subtle bg-surface p-4 shadow-sm hover:border-line-strong"
          >
            {n.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.imageUrl} alt="" className="mb-3 h-36 w-full rounded-xl object-cover" />
            )}
            <h2 className="text-base font-bold text-ink">{n.title}</h2>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-muted">{n.body.replace(/[*_~#]/g, "")}</p>
            {n.publishedAt && (
              <p className="mt-2 text-xs text-ink-subtle">{n.publishedAt.toLocaleDateString("ru-RU")}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Детальная страница новости**

Создать `src/app/(app)/news/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { FormattedText } from "@/components/formatted-text";

export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");
  const { id } = await params;

  const news = await db.news.findUnique({ where: { id } });
  if (!news || news.status !== "PUBLISHED") notFound();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink">{news.title}</h1>
      {news.publishedAt && (
        <p className="text-xs text-ink-subtle">{news.publishedAt.toLocaleDateString("ru-RU")}</p>
      )}
      {news.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={news.imageUrl} alt="" className="w-full rounded-2xl object-cover" />
      )}
      <div className="text-sm leading-7 text-ink">
        <FormattedText text={news.body} />
      </div>
    </div>
  );
}
```

Примечание: открытие этой страницы намеренно НЕ пишет `NewsRead` — прочтение подтверждается только кнопкой «Понятно» в попапе (см. спеку, раздел «Лента новостей»).

- [ ] **Step 3: Пункт меню «Новости» в кабинете сотрудника**

В `src/app/(app)/_nav.ts` внутри блока `if (hasEmployee) { ... }` (после пункта `/feedback`, строки 101-106) добавить:

```ts
    add("cabinet", t("nav.cabinet"), {
      href: "/news",
      label: "Новости",
      desc: "объявления компании",
      icon: ICONS.bell,
    });
```

- [ ] **Step 4: Проверить типы**

Run: `npx tsc --noEmit -p .`
Expected: без ошибок.

- [ ] **Step 5: Ручная проверка в браузере**

1. Под сотрудником открыть `/news` — видна опубликованная тестовая новость (из Task 5).
2. Кликнуть по карточке → `/news/[id]` — видны заголовок, фото (если есть), форматированный текст.
3. Убедиться, что открытие `/news/[id]` НЕ гасит попап при следующем заходе (если новость ещё не была подтверждена «Понятно» — попап должен появиться снова на `/`).
4. Из попапа (Task 5) нажать «Подробнее →» — должна открыться именно эта страница.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/news" "src/app/(app)/_nav.ts"
git commit -m "feat(news): лента новостей на сайте"
```

---

## Итоговая ручная проверка (сквозной сценарий)

- [ ] **Полный цикл**

1. Админ создаёт новость с фото, форматированным текстом (жирный/курсив), аудиторией «Отдел: Продажи».
2. Публикует.
3. Сотрудник из отдела «Продажи» заходит на сайт — видит попап.
4. Сотрудник НЕ из отдела «Продажи» заходит — попап не видит.
5. Админ жмёт «Отправить в бот» — сообщение с ссылкой на `/news/[id]` уходит через существующий конвейер `Notification`/`deliverTelegramNotifications` (проверить строку `telegramSentAt` в БД или лог `[notify:inline]` в консоли сервера).
6. Сотрудник из отдела «Продажи» нажимает «Понятно» — при следующем заходе (новая вкладка) попап больше не появляется, новость остаётся видна в `/news`.
