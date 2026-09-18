import "server-only";
import { del } from "@vercel/blob";

const BLOB_HOST = ".public.blob.vercel-storage.com";

/** Удаляет старый файл из Vercel Blob, если запись сменила/убрала изображение. */
export async function cleanupBlob(oldUrl: string | null, newUrl: string | null) {
  if (!oldUrl || oldUrl === newUrl) return;
  if (!oldUrl.includes(BLOB_HOST)) return; // внешняя ссылка — не трогаем
  try {
    await del(oldUrl);
  } catch {
    // нет BLOB_READ_WRITE_TOKEN или файл уже удалён — не блокируем сохранение
  }
}
