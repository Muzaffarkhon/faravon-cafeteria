import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { translateBatch } from "@/lib/translate";

/** UNAUTHENTICATED → 401, FORBIDDEN → 403, остальное → 400. */
function statusForError(message: string): number {
  if (/UNAUTHENTICATED/.test(message)) return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  return 400;
}

/**
 * Черновой автоперевод ru → tg/uz для блока «Переводы» в формах карточек,
 * партнёров, новостей и текстовых блоков (TranslationFields). Доступ — та же
 * роль C&B, что и у самих этих форм.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const s = await requireSession();
    assertCan(s.roles, "cards.manage");

    const body = (await request.json()) as { texts?: unknown };
    const texts = Array.isArray(body.texts) ? body.texts.filter((t): t is string => typeof t === "string") : null;
    if (!texts || texts.length === 0) {
      return NextResponse.json({ error: "Нет текста для перевода." }, { status: 400 });
    }
    if (texts.length > 20) {
      return NextResponse.json({ error: "Слишком много полей за раз." }, { status: 400 });
    }

    const result = await translateBatch(texts);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка перевода";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}
