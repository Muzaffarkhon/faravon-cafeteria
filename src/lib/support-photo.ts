import "server-only";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";

/** Фото в чате поддержки (сайт ↔ C&B ↔ Telegram-гость): проверка файла и работа с хранилищем. */

export const SUPPORT_PHOTO_MAX_BYTES = 3 * 1024 * 1024; // клиент жмёт до ~1.5 МБ, это потолок на сервере
export const SUPPORT_PHOTO_CAPTION_MAX = 1000;
/** Не больше стольких фото от одного сотрудника в одном обращении за сутки — защита хранилища. */
export const SUPPORT_PHOTO_PER_DAY = 20;

const TG_API = "https://api.telegram.org";

export type PhotoKind = { ext: "jpg" | "png" | "webp"; mime: string };

/** Тип по первым байтам, а не по заголовку от клиента: присланный `type` подделывается. */
export function sniffPhoto(buf: Uint8Array): PhotoKind | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length > 7 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (
    buf.length > 11 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

/** Удаляет файл из Blob (если это наш Blob-URL); ошибка хранилища не должна ломать удаление записи. */
export async function deleteBlobQuietly(url: string | null | undefined): Promise<void> {
  if (!url || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(url);
  } catch (e) {
    console.error("[support-photo] не удалось удалить файл из Blob", e);
  }
}

/**
 * Отправляет фото гостю в Telegram и возвращает file_id самого большого размера —
 * его храним вместо файла: фото остаётся в боте, а не в нашем хранилище.
 */
export async function sendPhotoToTelegram(
  token: string,
  chatId: string,
  file: { bytes: Uint8Array<ArrayBuffer>; mime: string; name: string },
  caption: string,
): Promise<{ fileId: string } | { error: string }> {
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption);
    form.append("photo", new Blob([file.bytes], { type: file.mime }), file.name);
    const r = await fetch(`${TG_API}/bot${token}/sendPhoto`, { method: "POST", body: form });
    const json = (await r.json().catch(() => null)) as { ok?: boolean; description?: string; result?: { photo?: { file_id: string }[] } } | null;
    const fileId = json?.result?.photo?.at(-1)?.file_id;
    if (!r.ok || !json?.ok || !fileId) return { error: json?.description ?? "Telegram не принял фото." };
    return { fileId };
  } catch {
    return { error: "Не удалось связаться с Telegram." };
  }
}

/** Скачивает файл из Telegram по file_id (для показа в админке через прокси). */
export async function fetchTelegramFile(token: string, fileId: string): Promise<Response | null> {
  try {
    const meta = await fetch(`${TG_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const json = (await meta.json().catch(() => null)) as { ok?: boolean; result?: { file_path?: string } } | null;
    const path = json?.result?.file_path;
    if (!meta.ok || !json?.ok || !path) return null;
    const file = await fetch(`${TG_API}/file/bot${token}/${path}`);
    return file.ok ? file : null;
  } catch {
    return null;
  }
}

/**
 * Удаляет фото из сообщения насовсем: файл из хранилища, ссылку/file_id из базы. Сообщение без подписи
 * исчезает целиком (никаких «фото удалено»), с подписью — остаётся только подпись. Копия в Telegram-боте
 * не затрагивается. Возвращает id диалога, либо null, если фото уже нет.
 */
export async function removePhotoFromMessage(messageId: string): Promise<string | null> {
  const m = await db.supportMessage.findUnique({
    where: { id: messageId },
    select: { threadId: true, body: true, imageUrl: true, tgFileId: true },
  });
  if (!m || (!m.imageUrl && !m.tgFileId)) return null;
  if (m.body.trim() === "") await db.supportMessage.delete({ where: { id: messageId } });
  else await db.supportMessage.update({ where: { id: messageId }, data: { imageUrl: null, tgFileId: null } });
  await deleteBlobQuietly(m.imageUrl);
  return m.threadId;
}
