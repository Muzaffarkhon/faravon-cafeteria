/**
 * Клиентская обрезка изображения по прямоугольнику из редактора кадрирования.
 * Используется полем загрузки баннера: пользователь двигает/масштабирует фото
 * в рамке нужной пропорции, здесь видимая часть переносится на canvas и
 * пережимается в WebP/JPEG под лимит 2 МБ.
 *
 * Только для браузера.
 */

import { encodeCanvasUnderLimit, loadBitmap } from "./image-optimize";

const MAX_OUT_WIDTH = 1600; // §5.12 — та же верхняя граница, что и у оптимизатора

/** Нормализованный кадр: доли натурального размера изображения (0..1). */
export type CropRect = {
  x: number; // левый край, доля ширины
  y: number; // верхний край, доля высоты
  w: number; // ширина кадра, доля ширины
  h: number; // высота кадра, доля высоты
};

export type CropOutput = {
  file: File;
  width: number;
  height: number;
};

/**
 * Вырезает `rect` из `source` и возвращает готовый к загрузке файл.
 * `aspect` (ширина/высота) задаёт пропорции выходного изображения — совпадает
 * с рамкой редактора, поэтому кадр не искажается.
 */
export async function renderCroppedFile(
  source: File,
  rect: CropRect,
  aspect: number,
  opts: { targetBytes?: number; maxOutWidth?: number; baseName?: string } = {},
): Promise<CropOutput | null> {
  const maxOutWidth = opts.maxOutWidth ?? MAX_OUT_WIDTH;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(source);
  } catch {
    return null;
  }
  const natW = "width" in bitmap ? bitmap.width : 0;
  const natH = "height" in bitmap ? bitmap.height : 0;
  if (!natW || !natH) {
    if ("close" in bitmap) bitmap.close();
    return null;
  }

  const sx = Math.max(0, Math.round(rect.x * natW));
  const sy = Math.max(0, Math.round(rect.y * natH));
  const sw = Math.min(natW - sx, Math.round(rect.w * natW));
  const sh = Math.min(natH - sy, Math.round(rect.h * natH));

  // Выходной размер: по ширине кадра, но не больше лимита и не больше того,
  // что реально есть в исходнике (не растягиваем вверх).
  const outW = Math.max(1, Math.min(maxOutWidth, sw));
  const outH = Math.max(1, Math.round(outW / aspect));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in bitmap) bitmap.close();
    return null;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(bitmap as CanvasImageSource, sx, sy, sw, sh, 0, 0, outW, outH);
  if ("close" in bitmap) bitmap.close();

  const encoded = await encodeCanvasUnderLimit(canvas, opts.targetBytes);
  if (!encoded) return null;

  const ext = encoded.type === "image/webp" ? "webp" : "jpg";
  const base = (opts.baseName ?? source.name.replace(/\.[^.]+$/, "")) || "banner";
  return {
    file: new File([encoded.blob], `${base}.${ext}`, { type: encoded.type }),
    width: outW,
    height: outH,
  };
}
