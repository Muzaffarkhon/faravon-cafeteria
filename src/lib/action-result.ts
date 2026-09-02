/**
 * Единый результат серверного действия: `{}` — успех, `{ error }` — ошибка с текстом.
 *
 * Почему не `throw`: в production-сборке Next.js/React заменяют текст ошибки,
 * брошенной из Server Action, на обезличенный digest («Minified React error #441»).
 * Поэтому действия возвращают этот объект, а клиент показывает `error` как есть.
 */
export type ActionResult = { error?: string };

/** Превращает исключение внутри `fn` в `{ error }`. Redirect/notFound пробрасываются. */
export async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (e instanceof Error && /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/.test(e.message)) throw e;
    return { error: e instanceof Error ? e.message : "Непредвиденная ошибка." };
  }
}
