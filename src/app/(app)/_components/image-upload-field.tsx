"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Input, cx } from "@/components/ui";
import { isSvgSafe, sanitizeSvg } from "@/lib/svg-sanitize";
import { isOptimizableRaster, optimizeImageFile } from "@/lib/image-optimize";
import { renderCroppedFile, type CropRect } from "@/lib/image-crop";
import { guardedUpload } from "@/lib/blob-upload";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_BYTES = 2 * 1024 * 1024; // §5.12: 2 МБ — лимит на итоговый файл
const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // исходник до сжатия (фото с телефона)
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Purpose = "card" | "banner";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Геометрия кадра выводится из состояния (фокус-точка + зум + размер рамки) —
 * без записи в ref во время рендера, чтобы не спорить с react-hooks.
 * focus = точка изображения (доли 0..1), которую держим в центре рамки.
 */
function geometry(
  nat: { w: number; h: number },
  fr: { w: number; h: number },
  zoom: number,
  focus: { x: number; y: number },
) {
  if (!nat.w || !fr.w) {
    return { dispW: 0, dispH: 0, offX: 0, offY: 0, cover: 1 };
  }
  const cover = Math.max(fr.w / nat.w, fr.h / nat.h);
  const dispW = nat.w * cover * zoom;
  const dispH = nat.h * cover * zoom;
  // допустимый диапазон фокус-точки, при котором картинка укрывает рамку
  const fx = clamp(focus.x, fr.w / (2 * dispW), 1 - fr.w / (2 * dispW));
  const fy = clamp(focus.y, fr.h / (2 * dispH), 1 - fr.h / (2 * dispH));
  const offX = fr.w / 2 - fx * dispW;
  const offY = fr.h / 2 - fy * dispH;
  return { dispW, dispH, offX, offY, cover };
}

/**
 * Поле изображения с загрузкой в Vercel Blob.
 * - `aspect` (ш/в): включает встроенный редактор кадрирования (двигать + зум +
 *   «уцентрить») перед загрузкой; без него растр просто сжимается.
 * - SVG всегда санитизируется и грузится без правок.
 */
export function ImageUploadField({
  value,
  onChange,
  purpose,
  aspect,
  label,
  hint,
  locale,
}: {
  value: string;
  onChange: (url: string) => void;
  purpose: Purpose;
  aspect?: number;
  label?: string;
  hint?: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const resolvedLabel = label ?? t("imageUpload.default");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"process" | "upload" | null>(null);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- редактор кадрирования ---
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editUrl, setEditUrl] = useState<string>("");
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState({ x: 0.5, y: 0.5 });
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Рамка меняет размер вместе с шириной колонки — следим ResizeObserver'ом.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !editFile) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setFrameSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [editFile]);

  // Освобождаем objectURL при закрытии редактора / размонтировании.
  useEffect(() => {
    if (!editUrl) return;
    return () => URL.revokeObjectURL(editUrl);
  }, [editUrl]);

  const geo = geometry(nat, frameSize, zoom, focus);

  function openEditor(file: File) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setNat({ w: im.naturalWidth, h: im.naturalHeight });
    im.src = url;
    setEditUrl(url);
    setEditFile(file);
    setZoom(1);
    setFocus({ x: 0.5, y: 0.5 });
    setFrameSize({ w: 0, h: 0 });
  }

  function closeEditor() {
    setEditFile(null);
    setEditUrl("");
    setNat({ w: 0, h: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function openEditorFromUrl(url: string) {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(t("imageUpload.loadFailed"));
      const blob = await res.blob();
      const file = new File([blob], "image.webp", { type: blob.type || "image/webp" });
      openEditor(file);
    } catch {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setErr(t("imageUpload.canvasFailed"));
          setBusy(false);
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          setBusy(false);
          if (blob) {
            const file = new File([blob], "image.webp", { type: "image/webp" });
            openEditor(file);
          } else {
            setErr(t("imageUpload.processFailed"));
          }
        }, "image/webp");
      };
      img.onerror = () => {
        setBusy(false);
        setErr(t("imageUpload.editLoadFailed"));
      };
      img.src = url;
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const g = geometry(nat, frameSize, zoom, focus);
    if (!g.dispW) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setFocus((f) => ({ x: f.x - dx / g.dispW, y: f.y - dy / g.dispH }));
  }
  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  async function doUpload(payload: File | Blob, name: string, contentType: string) {
    if (payload.size > MAX_BYTES) {
      setErr(t("imageUpload.shrinkFailed"));
      return false;
    }
    setStage("upload");
    const task = guardedUpload({
      name,
      payload,
      contentType,
      purpose,
      onProgress: setPct,
    });
    cancelRef.current = task.cancel;
    try {
      onChange(await task.done);
      return true;
    } finally {
      cancelRef.current = null;
    }
  }

  async function confirmCrop() {
    if (!editFile || !aspect) return;
    const g = geometry(nat, frameSize, zoom, focus);
    if (!g.dispW) return;
    setErr(null);
    setBusy(true);
    setPct(0);
    setStage("process");
    try {
      const rect: CropRect = {
        x: clamp(-g.offX / g.dispW, 0, 1),
        y: clamp(-g.offY / g.dispH, 0, 1),
        w: Math.min(1, frameSize.w / g.dispW),
        h: Math.min(1, frameSize.h / g.dispH),
      };
      const out = await renderCroppedFile(editFile, rect, aspect, {
        targetBytes: MAX_BYTES,
      });
      if (!out) {
        setErr(t("imageUpload.processOtherFile"));
        return;
      }
      if (await doUpload(out.file, out.file.name, out.file.type)) closeEditor();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("imageUpload.uploadFailed"));
    } finally {
      setBusy(false);
      setStage(null);
      setPct(0);
    }
  }

  async function onPick(file: File) {
    setErr(null);
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (!file.type.startsWith("image/") && !isSvg) {
      setErr(t("imageUpload.needImageFile"));
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setErr(t("imageUpload.tooLarge"));
      return;
    }

    // растр + задан aspect → редактор кадрирования
    if (!isSvg && aspect && isOptimizableRaster(file.type)) {
      openEditor(file);
      return;
    }

    setBusy(true);
    setPct(0);
    try {
      if (isSvg) {
        const clean = sanitizeSvg(await file.text());
        if (!isSvgSafe(clean)) {
          setErr(t("imageUpload.svgUnsafe"));
          return;
        }
        await doUpload(
          new Blob([clean], { type: "image/svg+xml" }),
          file.name,
          "image/svg+xml",
        );
      } else if (isOptimizableRaster(file.type)) {
        setStage("process");
        const { file: optimized } = await optimizeImageFile(file, {
          targetBytes: MAX_BYTES,
        });
        await doUpload(optimized, optimized.name, optimized.type);
      } else {
        await doUpload(file, file.name, file.type);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("imageUpload.uploadFailed"));
    } finally {
      setBusy(false);
      setStage(null);
      setPct(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const progressBar = busy ? (
    <div className="mt-2 flex items-center gap-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line-subtle">
        {stage === "process" || pct === 0 ? (
          <div className="progress-indeterminate bg-primary" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        )}
      </div>
      <span className="shrink-0 text-right text-xs tabular-nums text-ink-muted">
        {stage === "process"
          ? t("imageUpload.processing")
          : pct > 0
            ? `${t("imageUpload.uploadingPct")} ${pct}%`
            : t("imageUpload.uploading")}
      </span>
      {stage === "upload" && (
        <button
          type="button"
          onClick={() => cancelRef.current?.()}
          className="shrink-0 text-xs font-medium text-danger hover:underline"
        >
          {t("imageUpload.cancel")}
        </button>
      )}
    </div>
  ) : null;

  return (
    <Field label={resolvedLabel} htmlFor="img-upload-file" error={err ?? undefined}>
      {value && !editFile && (
        <div className="mb-3 space-y-2">
          {purpose === "card" && aspect ? (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-muted">
                {t("imageUpload.actualCardView")}
              </div>
              <div className="w-full max-w-[320px] overflow-hidden rounded-[20px] border border-line bg-surface shadow-sm">
                <div
                  className="relative w-full overflow-hidden bg-surface-sunken"
                  style={{ aspectRatio: String(aspect) }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={value} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="p-3.5">
                  <div className="h-3.5 w-3/4 rounded bg-line-subtle" />
                  <div className="mt-2 h-2.5 w-1/2 rounded bg-line-subtle/60" />
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cx(
                "relative overflow-hidden rounded-lg border border-line bg-surface-sunken",
                aspect ? "w-full max-w-[560px]" : "h-16 w-16",
              )}
              style={aspect ? { aspectRatio: String(aspect) } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex items-center gap-3">
            {aspect && (
              <button
                type="button"
                onClick={() => openEditorFromUrl(value)}
                disabled={busy}
                className="text-xs font-medium text-primary hover:underline"
              >
                {t("imageUpload.changePosition")}
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={busy}
              className="text-xs font-medium text-danger hover:underline"
            >
              {t("imageUpload.delete")}
            </button>
          </div>
        </div>
      )}

      {/* --- редактор кадрирования --- */}
      {editFile && (
        <div className="mb-2 space-y-2">
          <div className="text-xs font-semibold text-ink-muted">
            {t("imageUpload.dragHint")}
          </div>
          <div
            ref={boxRef}
            className="relative w-full max-w-[560px] cursor-grab touch-none overflow-hidden rounded-[20px] border-2 border-primary/50 bg-surface-sunken shadow-inner active:cursor-grabbing"
            style={{ aspectRatio: String(aspect ?? 1) }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {editUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={editUrl}
                alt=""
                draggable={false}
                className="max-w-none select-none"
                style={{
                  position: "absolute",
                  left: geo.offX,
                  top: geo.offY,
                  width: geo.dispW || undefined,
                  height: geo.dispH || undefined,
                }}
              />
            )}

            {/* Направляющие сетки третей */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
            >
              <div className="border-b border-r border-white/25" />
              <div className="border-b border-r border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-b border-r border-white/25" />
              <div className="border-b border-r border-white/25" />
              <div className="border-b border-white/25" />
              <div className="border-r border-white/25" />
              <div className="border-r border-white/25" />
              <div />
            </div>

            {/* Метка пропорции */}
            <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
              {aspect === 1.6 ? t("imageUpload.cardFrame") : aspect === 1 ? t("imageUpload.logoFrame") : `${t("imageUpload.cropFrame")} ${aspect}:1`}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted">{t("imageUpload.scale")}</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[var(--primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" onClick={confirmCrop} loading={busy}>
              {t("imageUpload.apply")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setZoom(1);
                setFocus({ x: 0.5, y: 0.5 });
              }}
            >
              {t("imageUpload.center")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setFocus((f) => ({ ...f, y: 0 }))}
            >
              {t("imageUpload.top")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setFocus((f) => ({ ...f, y: 1 }))}
            >
              {t("imageUpload.bottom")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setFocus((f) => ({ ...f, x: 0 }))}
            >
              {t("imageUpload.left")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setFocus((f) => ({ ...f, x: 1 }))}
            >
              {t("imageUpload.right")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={closeEditor}
              disabled={busy}
            >
              {t("imageUpload.cancel")}
            </Button>
          </div>
          {progressBar}
          <p className="text-xs text-ink-muted">
            {t("imageUpload.dragHint2")}
          </p>
        </div>
      )}

      {!editFile && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              id="img-upload-file"
              type="file"
              accept={ACCEPT}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPick(f);
              }}
              className={cx(
                "text-sm text-ink-muted",
                "file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5",
                "file:text-sm file:font-medium file:text-ink hover:file:bg-line-subtle",
                busy && "opacity-60",
              )}
            />
            <button
              type="button"
              onClick={() => setManual((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {manual ? t("imageUpload.hideLink") : t("imageUpload.specifyLink")}
            </button>
          </div>

          {progressBar}

          {manual && (
            <Input
              className="mt-2"
              inputMode="url"
              placeholder="https://…"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          )}

          <p className="mt-1 text-xs text-ink-muted">
            {hint ?? t("imageUpload.defaultHint")}
          </p>
        </>
      )}
    </Field>
  );
}
