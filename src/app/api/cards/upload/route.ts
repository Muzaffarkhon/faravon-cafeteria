import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Клиентская загрузка изображений карточек льгот в Vercel Blob.
 * Браузер шлёт файл напрямую в Blob (минуя лимит тела serverless-функции),
 * этот роут лишь выдаёт подписанный токен после проверки прав.
 *
 * Требует env `BLOB_READ_WRITE_TOKEN` (создаётся вместе с Blob-store в дашборде Vercel).
 */

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024; // 4 МБ

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const s = await requireSession();
        assertCan(s.roles, "cards.manage");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: s.user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Долетает только когда роут публично доступен (в проде). Локально без
        // туннеля не вызывается — не критично, URL клиент получает напрямую.
        let userId: string | undefined;
        try {
          userId = tokenPayload ? JSON.parse(tokenPayload).userId : undefined;
        } catch {
          /* ignore */
        }
        if (userId) {
          await audit({
            actorId: userId,
            action: "CARD_IMAGE_UPLOADED",
            entityType: "BenefitCard",
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
