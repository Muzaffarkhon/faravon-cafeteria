import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { put } from "@vercel/blob";
import { requireSession } from "@/lib/auth";
import { assertCan, type Permission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Загрузка изображений в Vercel Blob (карточки льгот, баннеры).
 *
 * Два пути:
 *  1. `multipart/form-data` — серверная загрузка: браузер шлёт файл нам, мы
 *     кладём его в Blob через `put()`. Прямой путь браузер → хранилище Vercel
 *     Blob из некоторых сетей нестабилен (обрывы / 5xx / троттлинг), поэтому
 *     файл проходит через функцию. Тело жмётся клиентом под 2 МБ — лимит
 *     serverless (~4.5 МБ) не мешает.
 *  2. JSON (`@vercel/blob/client` `upload()`) — прежняя клиентская загрузка:
 *     этот роут лишь выдаёт подписанный токен. Оставлен как запасной путь.
 *
 * Требует env `BLOB_READ_WRITE_TOKEN` (создаётся вместе с Blob-store в Vercel).
 */

// §5.12: PNG/JPG/WebP/SVG, ограничение размера 2 МБ. SVG санитизируется на
// клиенте перед загрузкой; тут — только тип и размер.
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 МБ

const PURPOSE_PERMISSION: Record<string, Permission> = {
  card: "cards.manage",
  banner: "partners.manage",
};

/** Нормализует произвольный purpose и возвращает нужное право. */
function resolvePurpose(raw: string | null | undefined): {
  purpose: string;
  permission: Permission;
} {
  const purpose = raw && PURPOSE_PERMISSION[raw] ? raw : "card";
  return { purpose, permission: PURPOSE_PERMISSION[purpose] };
}

/** UNAUTHENTICATED → 401, FORBIDDEN → 403, остальное → 400. */
function statusForError(message: string): number {
  if (/UNAUTHENTICATED/.test(message)) return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  return 400;
}

function noStoreConfigured(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Хранилище изображений не настроено: нет BLOB_READ_WRITE_TOKEN. " +
        "На Vercel — добавьте Blob-store (Storage → Create → Blob); локально — `vercel env pull`.",
    },
    { status: 503 },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return noStoreConfigured();

  const contentType = request.headers.get("content-type") ?? "";

  // --- 1. Серверная загрузка (multipart/form-data) ---
  if (contentType.startsWith("multipart/form-data")) {
    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Файл не получен." }, { status: 400 });
      }

      const { purpose, permission } = resolvePurpose(
        typeof form.get("purpose") === "string"
          ? (form.get("purpose") as string)
          : null,
      );

      const s = await requireSession();
      assertCan(s.roles, permission);

      const type = file.type || "application/octet-stream";
      if (!ALLOWED.includes(type)) {
        return NextResponse.json(
          {
            error:
              "Тип файла не поддерживается: нужен PNG, JPEG, WebP или SVG.",
          },
          { status: 415 },
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "Файл больше 2 МБ. Уменьшите изображение и попробуйте снова." },
          { status: 413 },
        );
      }

      const blob = await put(file.name || "image", file, {
        access: "public",
        contentType: type,
        addRandomSuffix: true,
        token,
      });

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

      return NextResponse.json({ url: blob.url });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ошибка загрузки";
      return NextResponse.json({ error: message }, { status: statusForError(message) });
    }
  }

  // --- 2. Клиентская загрузка (@vercel/blob/client upload()) — запасной путь ---
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let purpose = "card";
        try {
          if (clientPayload) purpose = JSON.parse(clientPayload).purpose ?? "card";
        } catch {
          /* оставляем card */
        }
        const { permission } = resolvePurpose(purpose);

        const s = await requireSession();
        assertCan(s.roles, permission);
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: s.user.id, purpose }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Долетает только когда роут публично доступен (в проде). Локально без
        // туннеля не вызывается — не критично, URL клиент получает напрямую.
        let userId: string | undefined;
        let purpose = "card";
        try {
          if (tokenPayload) {
            const parsed = JSON.parse(tokenPayload);
            userId = parsed.userId;
            purpose = parsed.purpose ?? "card";
          }
        } catch {
          /* ignore */
        }
        if (userId) {
          await audit({
            actorId: userId,
            action: purpose === "banner" ? "BANNER_IMAGE_UPLOADED" : "CARD_IMAGE_UPLOADED",
            entityType: purpose === "banner" ? "PartnerBanner" : "BenefitCard",
            entityId: "-",
            newValue: { url: blob.url },
          });
        }
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 400 },
    );
  }
}
