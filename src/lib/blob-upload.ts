/**
 * Загрузка изображения в Vercel Blob через наш роут `/api/blob/upload`
 * (серверная загрузка: `multipart/form-data` → сервер кладёт файл в Blob
 * через `put()`). Прямой путь браузер → хранилище Vercel Blob из некоторых
 * сетей нестабилен — обрывы / 5xx / зависания, — поэтому файл идёт через
 * функцию.
 *
 * Защита от зависания:
 * - ручная отмена (кнопка «Отмена»);
 * - сторож бездействия: если за `idleTimeoutMs` не было ни прогресса отправки,
 *   ни ответа — запрос обрывается.
 *
 * Используем `XMLHttpRequest` (не `fetch`) ради `upload.onprogress` — прогресс
 * отправки тела нужен для полосы загрузки.
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
  const idle = opts.idleTimeoutMs ?? 45_000;
  const xhr = new XMLHttpRequest();
  let timedOut = false;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const arm = () => {
    clear();
    timer = setTimeout(() => {
      timedOut = true;
      xhr.abort();
    }, idle);
  };

  const done = new Promise<string>((resolve, reject) => {
    const fail = (msg: string) => reject(new Error(msg));

    xhr.upload.addEventListener("progress", (e) => {
      arm();
      if (e.lengthComputable) {
        opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    });
    // Тело отправлено — ждём, пока сервер зальёт в Blob и ответит.
    xhr.upload.addEventListener("load", arm);
    xhr.addEventListener("progress", arm);

    xhr.addEventListener("load", () => {
      clear();
      let payload: unknown;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      const data = (payload ?? {}) as { url?: string; error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
        resolve(data.url);
        return;
      }
      if (xhr.status === 503 || xhr.status === 500) {
        fail(
          data.error ??
            "Хранилище изображений недоступно. Попробуйте позже или укажите ссылку вручную.",
        );
        return;
      }
      fail(data.error ?? `Не удалось загрузить файл (код ${xhr.status}).`);
    });

    xhr.addEventListener("error", () => {
      clear();
      fail(
        "Сеть недоступна: не удалось отправить файл на сервер. Проверьте соединение и попробуйте снова.",
      );
    });

    xhr.addEventListener("abort", () => {
      clear();
      if (timedOut) {
        fail(
          "Загрузка прервана: сервер не отвечает. Проверьте соединение и попробуйте снова.",
        );
      } else if (cancelled) {
        fail("Загрузка отменена.");
      } else {
        fail("Загрузка прервана.");
      }
    });

    const form = new FormData();
    form.append("purpose", opts.purpose);
    form.append(
      "file",
      opts.payload instanceof File
        ? opts.payload
        : new File([opts.payload], opts.name, { type: opts.contentType }),
      opts.name,
    );

    arm();
    xhr.open("POST", "/api/blob/upload");
    xhr.send(form);
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      clear();
      xhr.abort();
    },
  };
}
