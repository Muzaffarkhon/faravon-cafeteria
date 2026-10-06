import { optimizeImageFile } from "@/lib/image-optimize";

/** Какие файлы предлагает выбрать окно «Прикрепить фото». */
export const SUPPORT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Отправляет фото в диалог (роут `/api/support/photo`); возвращает текст ошибки или null при успехе.
 * Снимок с телефона (3–12 МБ) сначала сжимается — так он пролезает в лимит и грузится быстрее.
 */
export async function sendSupportPhoto(opts: {
  threadId: string;
  file: File;
  caption?: string;
  replyToId?: string;
}): Promise<string | null> {
  const { file } = await optimizeImageFile(opts.file, { maxEdge: 1280, targetBytes: 1.5 * 1024 * 1024 });
  const form = new FormData();
  form.append("threadId", opts.threadId);
  form.append("file", file, file.name);
  if (opts.caption?.trim()) form.append("caption", opts.caption.trim());
  if (opts.replyToId) form.append("replyToId", opts.replyToId);
  try {
    const r = await fetch("/api/support/photo", { method: "POST", body: form });
    if (r.ok) return null;
    const data = (await r.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? `Не удалось отправить фото (код ${r.status}).`;
  } catch {
    return "Сеть недоступна: не удалось отправить фото.";
  }
}

/** Картинка из буфера обмена (скриншот, скопированное фото) или null, если там только текст/другое. */
export function clipboardImage(e: { clipboardData: DataTransfer | null }): File | null {
  const files = Array.from(e.clipboardData?.files ?? []);
  const img = files.find((f) => SUPPORT_PHOTO_ACCEPT.split(",").includes(f.type));
  if (!img) return null;
  // У вставленного скриншота имя безликое («image.png») — даём понятное.
  return new File([img], `screenshot-${Date.now()}.${img.type === "image/jpeg" ? "jpg" : img.type === "image/webp" ? "webp" : "png"}`, { type: img.type });
}
