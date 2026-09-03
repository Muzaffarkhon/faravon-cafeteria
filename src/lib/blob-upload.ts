import { upload } from "@vercel/blob/client";

/**
 * Обёртка над @vercel/blob `upload()` с защитой от зависания:
 * - `abortSignal` для ручной отмены (кнопка «Отмена»);
 * - сторож бездействия: если за `idleTimeoutMs` не было ни прогресса, ни
 *   завершения — запрос обрывается (частый случай — уснувшая БД, из-за которой
 *   не отвечает выдача токена в /api/blob/upload).
 *
 * Только для браузера.
 */

export type UploadPurpose = "card" | "banner";

export type GuardedUpload = {
  /** URL загруженного файла либо исключение с понятным текстом. */
  done: Promise<string>;
  /** Прервать загрузку (не таймаут, а действие пользователя). */
  cancel: () => void;
};

export function guardedUpload(opts: {
  name: string;
  payload: File | Blob;
  contentType: string;
  purpose: UploadPurpose;
  onProgress?: (pct: number) => void;
  idleTimeoutMs?: number;
}): GuardedUpload {
  const ctrl = new AbortController();
  const idle = opts.idleTimeoutMs ?? 45_000;
  let timedOut = false;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, idle);
  };
  arm();

  const done = upload(opts.name, opts.payload, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    contentType: opts.contentType,
    clientPayload: JSON.stringify({ purpose: opts.purpose }),
    abortSignal: ctrl.signal,
    // Частями с параллельной отправкой и повтором упавшей части — заметно
    // устойчивее на плохой связи, чем один большой PUT.
    multipart: opts.payload.size > 512 * 1024,
    onUploadProgress: (e) => {
      arm();
      opts.onProgress?.(Math.round(e.percentage));
    },
  })
    .then((b) => {
      if (timer) clearTimeout(timer);
      return b.url;
    })
    .catch((e: unknown) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        throw new Error(
          "Загрузка прервана: сервер не отвечает. Проверьте соединение и попробуйте снова.",
        );
      }
      if (cancelled || ctrl.signal.aborted) {
        throw new Error("Загрузка отменена.");
      }
      const msg = e instanceof Error ? e.message : "";
      if (/retrieve the client token|client token/i.test(msg)) {
        // /api/blob/upload не отдал токен — почти всегда не настроен Blob-store
        throw new Error(
          "Хранилище изображений недоступно: не настроен BLOB_READ_WRITE_TOKEN. " +
            "Локально — добавьте токен в .env; на проде — подключите Blob-store.",
        );
      }
      throw e instanceof Error ? e : new Error("Не удалось загрузить файл.");
    });

  return {
    done,
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      ctrl.abort();
    },
  };
}
