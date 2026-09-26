"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Select, buttonClass } from "@/components/ui";
import { RichTextarea } from "@/components/rich-textarea";
import { FormattedText } from "@/components/formatted-text";
import { ImageUploadField } from "@/app/(app)/_components/image-upload-field";
import { TranslationFields } from "@/components/translation-fields";
import type { Locale } from "@/lib/i18n/shared";
import { saveNews, type NewsFormState } from "./actions";

const NEWS_TRANSLATION_FIELDS = [
  { name: "title", label: "Заголовок" },
  { name: "body", label: "Текст", multiline: true },
];

export type NewsValues = {
  id?: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audience?: { department?: string; position?: string } | null;
  translations?: Partial<Record<"tg" | "uz", Record<string, string>>> | null;
};

export function NewsForm({
  initial,
  departments,
  positions,
  locale,
}: {
  initial?: NewsValues;
  departments: string[];
  positions: string[];
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState<NewsFormState, FormData>(saveNews, {});
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Заголовок" htmlFor="title" required>
        <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>

      <Field
        label="Текст"
        htmlFor="body"
        hint="Ctrl+B — жирный, Ctrl+I — курсив, Ctrl+U — подчёркнутый, Ctrl+Shift+X — зачёркнутый, Ctrl+Alt+1 — заголовок строки"
      >
        <RichTextarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
      </Field>
      {body.trim() && (
        <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">Предпросмотр</p>
          <div className="mt-1.5 text-sm leading-6 text-ink">
            <FormattedText text={body} />
          </div>
        </div>
      )}

      <ImageUploadField
        value={imageUrl}
        onChange={setImageUrl}
        purpose="news"
        label="Фото новости"
        locale={locale}
      />
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <p className="pt-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Кому показывать</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Отдел" htmlFor="department" hint="Не выбрано — все отделы">
          <Select id="department" name="department" defaultValue={initial?.audience?.department ?? ""}>
            <option value="">Все отделы</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Должность" htmlFor="position" hint="Не выбрано — все должности">
          <Select id="position" name="position" defaultValue={initial?.audience?.position ?? ""}>
            <option value="">Все должности</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>
      </div>

      <TranslationFields fields={NEWS_TRANSLATION_FIELDS} initial={initial?.translations} />

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={pending}>Сохранить черновик</Button>
        {initial?.id && (
          <Link href={`/admin/news/${initial.id}`} className={buttonClass({ variant: "secondary" })}>
            Отмена
          </Link>
        )}
      </div>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.success && state.newsId && !initial?.id && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Черновик сохранён.{" "}
          <Link href={`/admin/news/${state.newsId}`} className="underline">
            Перейти к публикации →
          </Link>
        </p>
      )}
      {state.success && initial?.id && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Сохранено.
        </p>
      )}
    </form>
  );
}
