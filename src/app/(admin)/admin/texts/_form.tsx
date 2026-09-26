"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { TranslationFields } from "@/components/translation-fields";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { updateTextBlock, type TextFormState } from "./actions";

export function TextBlockForm({
  blockKey,
  title,
  content,
  translations,
  locale,
}: {
  blockKey: string;
  title: string;
  content: string;
  translations?: Partial<Record<"tg" | "uz", Record<string, string>>> | null;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const action = updateTextBlock.bind(null, blockKey);
  const [state, formAction, pending] = useActionState<TextFormState, FormData>(action, {});
  const textTranslationFields = [
    { name: "title", label: "Заголовок", sourceId: `${blockKey}-title` },
    { name: "content", label: "Текст", multiline: true, sourceId: `${blockKey}-content` },
  ];

  return (
    <form
      action={formAction}
      className="rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <div className="mb-2 font-mono text-xs text-ink-subtle">{blockKey}</div>
      <div className="space-y-3">
        <Field label={t("texts.titleLabel")} htmlFor={`${blockKey}-title`} required>
          <Input id={`${blockKey}-title`} name="title" defaultValue={title} required />
        </Field>
        <Field label={t("texts.contentLabel")} htmlFor={`${blockKey}-content`} required>
          <Textarea id={`${blockKey}-content`} name="content" defaultValue={content} rows={4} required />
        </Field>
        <TranslationFields fields={textTranslationFields} initial={translations} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {t("texts.save")}
        </Button>
        {state.ok && (
          <span className="text-sm font-medium text-success-strong" role="status">
            {t("texts.saved")}
          </span>
        )}
        {state.error && (
          <span className="text-sm font-medium text-danger" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
