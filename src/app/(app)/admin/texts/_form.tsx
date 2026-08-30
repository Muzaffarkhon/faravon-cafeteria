"use client";

import { useActionState } from "react";
import { updateTextBlock, type TextFormState } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";

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
    <form action={formAction} className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-1 text-xs font-mono text-neutral-400">{blockKey}</div>
      <div>
        <label className="block text-sm font-medium text-neutral-700">Заголовок</label>
        <input name="title" defaultValue={title} className={inputCls} required />
      </div>
      <div className="mt-3">
        <label className="block text-sm font-medium text-neutral-700">Текст</label>
        <textarea name="content" defaultValue={content} rows={4} className={inputCls} required />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Сохранение…" : "Сохранить"}
        </button>
        {state.ok && <span className="text-sm text-emerald-600">Сохранено</span>}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
