/**
 * Клиентская оптимизация фото перед загрузкой в Blob (§5.12).
 *
 * Реальные снимки с телефона весят 3–12 МБ и не пролезают в лимит 2 МБ.
 * Здесь растровое изображение ужимается по стороне и пережимается в WebP
 * (с откатом в JPEG), с понижением качества пока не влезет в лимит.
 * SVG не трогаем — его санитизирует svg-sanitize.
 *
 * Только для браузера: нужны Image / <canvas> / createImageBitmap.
 */

const DEFAULT_MAX_EDGE = 1600; // достаточно для карточки/баннера в вебе
const DEFAULT_TARGET_BYTES = 2 * 1024 * 1024; // §5.12: 2 МБ
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];

export type OptimizeResult = {
  file: File;
  changed: boolean;
  width: number;
  height: number;
};

const RASTER = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isOptimizableRaster(type: string): boolean {
  return RASTER.has(type);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* Safari/старые движки — падаем на <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Ужимает растровое фото под лимит. PNG/JPEG/WebP → WebP (или JPEG, если WebP
 * не поддержан кодировщиком). Возвращает исходный файл без изменений, если он
 * уже меньше лимита и не длиннее maxEdge, либо если что-то пошло не так —
 * тогда решение остаётся за проверкой размера в вызывающем коде.
 */
export async function optimizeImageFile(
  file: File,
  opts: { maxEdge?: number; targetBytes?: number } = {},
): Promise<OptimizeResult> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const targetBytes = opts.targetBytes ?? DEFAULT_TARGET_BYTES;

  if (!isOptimizableRaster(file.type)) {
    return { file, changed: false, width: 0, height: 0 };
  }

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return { file, changed: false, width: 0, height: 0 };
  }

  const srcW = "width" in bitmap ? bitmap.width : 0;
  const srcH = "height" in bitmap ? bitmap.height : 0;
  if (!srcW || !srcH) {
    if ("close" in bitmap) bitmap.close();
    return { file, changed: false, width: 0, height: 0 };
  }

  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  // Ничего не даст: и так в пределах стороны и лимита.
  if (scale === 1 && file.size <= targetBytes) {
    if ("close" in bitmap) bitmap.close();
    return { file, changed: false, width: srcW, height: srcH };
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in bitmap) bitmap.close();
    return { file, changed: false, width: srcW, height: srcH };
  }
  ctx.imageSmoothingQuality = "high";
  // Плоский белый фон вместо прозрачности — WebP/JPEG её не хранят одинаково.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, outW, outH);
  if ("close" in bitmap) bitmap.close();

  const webpProbe = await canvasToBlob(canvas, "image/webp", 0.8);
  const outType =
    webpProbe && webpProbe.type === "image/webp" ? "image/webp" : "image/jpeg";

  let best: Blob | null = webpProbe && outType === "image/webp" ? webpProbe : null;
  for (const q of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, outType, q);
    if (!blob) continue;
    best = blob;
    if (blob.size <= targetBytes) break;
  }

  if (!best) {
    return { file, changed: false, width: srcW, height: srcH };
  }

  // Пережатое оказалось не легче исходника (бывает на маленьких PNG-иконках)
  // и исходник уже влезает — оставляем исходник.
  if (best.size >= file.size && file.size <= targetBytes && scale === 1) {
    return { file, changed: false, width: srcW, height: srcH };
  }

  const ext = outType === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  const optimized = new File([best], `${base}.${ext}`, { type: outType });
  return {
    file: optimized,
    changed: true,
    width: outW,
    height: outH,
  };
}
