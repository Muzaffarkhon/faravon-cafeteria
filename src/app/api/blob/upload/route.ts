import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSession } from "@/lib/auth";
import { assertCan, type Permission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Клиентская загрузка изображений в Vercel Blob (карточки льгот, баннеры).
 * Браузер шлёт файл напрямую в Blob (минуя лимит тела serverless-функции),
 * этот роут лишь выдаёт подписанный токен после проверки прав.
 *
 * `clientPayload` из upload() = JSON `{ purpose }`; по нему выбираем право.
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

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Хранилище изображений не настроено: нет BLOB_READ_WRITE_TOKEN. " +
          "На Vercel — добавьте Blob-store (Storage → Create → Blob); локально — `vercel env pull`.",
      },
      { status: 503 },
    );
  }

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
        const permission = PURPOSE_PERMISSION[purpose] ?? PURPOSE_PERMISSION.card;

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
