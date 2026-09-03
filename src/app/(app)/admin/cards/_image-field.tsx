"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Field, Input, cx } from "@/components/ui";
import { isSvgSafe, sanitizeSvg } from "@/lib/svg-sanitize";
import { isOptimizableRaster, optimizeImageFile } from "@/lib/image-optimize";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_BYTES = 2 * 1024 * 1024; // §5.12: 2 МБ — лимит на итоговый файл
const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // исходник до сжатия (фото с телефона)

/**
 * Поле изображения карточки: загрузка файла в Vercel Blob либо ссылка вручную.
 * Держит скрытый <input name="imageUrl">, который читает серверный экшен.
 */
export function CardImageField({ initial }: { initial?: string | null }) {
  const [url, setUrl] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"optimize" | "upload" | null>(null);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setErr(null);
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (!file.type.startsWith("image/") && !isSvg) {
      setErr("Нужен файл изображения: PNG, JPEG, WebP или SVG.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setErr("Файл больше 25 МБ — это слишком тяжёлый исходник.");
      return;
    }
    setBusy(true);
    setPct(0);
    try {
      let payload: File | Blob = file;
      let name = file.name;
      let contentType = file.type;

      if (isSvg) {
        // SVG санитизируем перед загрузкой (§5.12), без пережатия
        const clean = sanitizeSvg(await file.text());
        if (!isSvgSafe(clean)) {
          setErr("SVG содержит потенциально опасные элементы. Загрузите PNG/JPEG.");
          return;
        }
        payload = new Blob([clean], { type: "image/svg+xml" });
        contentType = "image/svg+xml";
      } else if (isOptimizableRaster(file.type)) {
        // Фото ужимаем по стороне и пережимаем в WebP/JPEG под лимит 2 МБ
        setStage("optimize");
        const { file: optimized } = await optimizeImageFile(file, {
          targetBytes: MAX_BYTES,
        });
        payload = optimized;
        name = optimized.name;
        contentType = optimized.type;
      }

      if (payload.size > MAX_BYTES) {
        setErr(
          "Не удалось ужать до 2 МБ — уменьшите изображение вручную или загрузите менее детализированное.",
        );
        return;
      }

      setStage("upload");
      const blob = await upload(name, payload, {
        access: "public",
        handleUploadUrl: "/api/cards/upload",
        contentType,
        onUploadProgress: (e) => setPct(Math.round(e.percentage)),
      });
      setUrl(blob.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить файл.");
    } finally {
      setBusy(false);
      setStage(null);
      setPct(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Field label="Изображение" htmlFor="card-image-file" error={err ?? undefined}>
      <input type="hidden" name="imageUrl" value={url} />

      {url && (
        <div className="mb-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="h-16 w-16 rounded-md border border-line object-cover"
          />
          <button
            type="button"
            onClick={() => setUrl("")}
            className="text-xs font-medium text-danger hover:underline"
          >
            Удалить
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          id="card-image-file"
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
          {manual ? "скрыть ссылку" : "указать ссылку"}
        </button>
      </div>

      {busy && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-subtle">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{
                width:
                  stage === "optimize" ? "15%" : `${Math.max(pct, 4)}%`,
              }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-muted">
            {stage === "optimize" ? "Оптимизация…" : `Загрузка ${pct}%`}
          </span>
        </div>
      )}

      {manual && (
        <Input
          className="mt-2"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}

      <p className="mt-1 text-xs text-ink-muted">
        PNG, JPEG, WebP или SVG. Фото сжимается автоматически — можно грузить
        снимок с телефона как есть.
      </p>
    </Field>
  );
}
