"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_PLACEHOLDERS,
  TEMPLATE_SAMPLE_VARS,
  renderTemplate,
} from "@/lib/notification-format";
import {
  resetNotificationTemplate,
  updateNotificationTemplate,
  type TemplateFormState,
} from "./actions";

export function TemplateForm({
  event,
  label,
  body,
  overridden,
  editedBy,
  editedAt,
}: {
  event: string;
  label: string;
  body: string;
  overridden: boolean;
  editedBy?: string | null;
  editedAt?: string | null;
}) {
  const action = updateNotificationTemplate.bind(null, event);
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(action, {});
  const [draft, setDraft] = useState(body);
  const [resetting, startReset] = useTransition();

  const placeholders = TEMPLATE_PLACEHOLDERS[event] ?? [];
  const defaultBody = DEFAULT_TEMPLATES[event]?.body ?? "";
  const preview = safeRender(draft, TEMPLATE_SAMPLE_VARS[event] ?? {});

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-xs text-ink-subtle">{event}</span>
        {overridden ? (
          <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary-strong">
            изменён
          </span>
        ) : (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[0.6875rem] text-ink-subtle">
            по умолчанию
          </span>
        )}
        {overridden && editedAt && (
          <span className="text-[0.6875rem] text-ink-subtle">
            {editedBy ? `${editedBy}, ` : ""}
            {editedAt}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Field label="Название" htmlFor={`${event}-label`} required>
          <Input id={`${event}-label`} name="label" defaultValue={label} required />
        </Field>

        <Field
          label="Текст уведомления"
          htmlFor={`${event}-body`}
          required
          hint={
            <>
              Плейсхолдеры:{" "}
              {placeholders.map((p, i) => (
                <span key={p}>
                  {i > 0 && ", "}
                  <code className="rounded bg-surface-muted px-1">{`{${p}}`}</code>
                </span>
              ))}
              . Блок <code className="rounded bg-surface-muted px-1">[[ … ]]</code> исчезает, если
              плейсхолдер внутри пустой.
            </>
          }
        >
          <Textarea
            id={`${event}-body`}
            name="body"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            required
          />
        </Field>

        <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
          <div className="mb-0.5 text-xs font-medium text-ink-subtle">Пример</div>
          <div className="text-ink">🔔 {preview || <span className="text-ink-subtle">—</span>}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Сохранить
        </Button>
        {overridden && (
          <button
            type="button"
            disabled={resetting}
            onClick={() =>
              startReset(async () => {
                await resetNotificationTemplate(event);
                setDraft(defaultBody);
              })
            }
            className="text-sm font-medium text-ink-muted hover:text-danger hover:underline"
          >
            Сбросить к стандартному
          </button>
        )}
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

function safeRender(body: string, vars: Record<string, string>): string {
  try {
    return renderTemplate(body, vars);
  } catch {
    return "";
  }
}
