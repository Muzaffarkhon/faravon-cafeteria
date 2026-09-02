"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { updateTextBlock, type TextFormState } from "./actions";

export function TextBlockForm({
  blockKey,
  title,
  content,
}: {
  blockKey: string;
  title: string;
  content: string;
}) {
  const action = updateTextBlock.bind(null, blockKey);
  const [state, formAction, pending] = useActionState<TextFormState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className="rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <div className="mb-2 font-mono text-xs text-ink-subtle">{blockKey}</div>
      <div className="space-y-3">
        <Field label="Заголовок" htmlFor={`${blockKey}-title`} required>
          <Input id={`${blockKey}-title`} name="title" defaultValue={title} required />
        </Field>
        <Field label="Текст" htmlFor={`${blockKey}-content`} required>
          <Textarea id={`${blockKey}-content`} name="content" defaultValue={content} rows={4} required />
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Сохранить
        </Button>
        {state.ok && (
          <span className="text-sm font-medium text-success-strong" role="status">
            Сохранено
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
