"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Field, Input, cx } from "@/components/ui";

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Поле изображения карточки: загрузка файла в Vercel Blob либо ссылка вручную.
 * Держит скрытый <input name="imageUrl">, который читает серверный экшен.
 */
export function CardImageField({ initial }: { initial?: string | null }) {
  const [url, setUrl] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Нужен файл изображения (PNG, JPEG или WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr("Файл больше 4 МБ — сожмите или уменьшите изображение.");
      return;
    }
    setBusy(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/cards/upload",
        contentType: file.type,
      });
      setUrl(blob.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить файл.");
    } finally {
      setBusy(false);
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
        {busy && <span className="text-xs text-ink-muted">Загрузка…</span>}
        <button
          type="button"
          onClick={() => setManual((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {manual ? "скрыть ссылку" : "указать ссылку"}
        </button>
      </div>

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
        PNG, JPEG или WebP, до 4 МБ.
      </p>
    </Field>
  );
}
