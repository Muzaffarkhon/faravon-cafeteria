"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_PLACEHOLDERS,
  TEMPLATE_SAMPLE_VARS,
  renderTemplate,
} from "@/lib/notification-format";
import { DEFAULT_TEMPLATES_I18N } from "@/lib/notification-i18n";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  resetNotificationTemplate,
  updateNotificationTemplate,
  type TemplateFormState,
} from "./actions";

export function TemplateForm({
  event,
  label,
  body,
  bodyTg,
  bodyUz,
  overridden,
  editedBy,
  editedAt,
  locale,
}: {
  event: string;
  label: string;
  body: string;
  bodyTg: string;
  bodyUz: string;
  overridden: boolean;
  editedBy?: string | null;
  editedAt?: string | null;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const action = updateNotificationTemplate.bind(null, event);
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(action, {});
  const [draft, setDraft] = useState(body);
  const [draftTg, setDraftTg] = useState(bodyTg);
  const [draftUz, setDraftUz] = useState(bodyUz);
  const [resetting, startReset] = useTransition();

  const placeholders = TEMPLATE_PLACEHOLDERS[event] ?? [];
  const defaultBody = DEFAULT_TEMPLATES[event]?.body ?? "";
  const preview = safeRender(draft, TEMPLATE_SAMPLE_VARS[event] ?? {});

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-xs text-ink-subtle">{event}</span>
        {overridden ? (
          <span className="rounded bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary-strong">
            {t("notifications.changed")}
          </span>
        ) : (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-ink-subtle">
            {t("notifications.default")}
          </span>
        )}
        {overridden && editedAt && (
          <span className="text-xs text-ink-subtle">
            {editedBy ? `${editedBy}, ` : ""}
            {editedAt}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Field label={t("notifications.nameLabel")} htmlFor={`${event}-label`} required>
          <Input id={`${event}-label`} name="label" defaultValue={label} required />
        </Field>

        <Field
          label={t("notifications.bodyLabel")}
          htmlFor={`${event}-body`}
          required
          hint={
            <>
              {t("notifications.placeholders")}{" "}
              {placeholders.map((p, i) => (
                <span key={p}>
                  {i > 0 && ", "}
                  <code className="rounded bg-surface-muted px-1">{`{${p}}`}</code>
                </span>
              ))}
              . {t("notifications.blockHint1")} <code className="rounded bg-surface-muted px-1">[[ … ]]</code>{" "}
              {t("notifications.blockHint2")}{" "}
              <code className="rounded bg-surface-muted px-1">{`<b>${t("notifications.boldExample")}</b>`}</code>,{" "}
              <code className="rounded bg-surface-muted px-1">{`<code>${t("notifications.monoExample")}</code>`}</code>.
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

        <Field label={t("notifications.bodyTg")} htmlFor={`${event}-body-tg`} hint={t("notifications.translationHint")}>
          <Textarea
            id={`${event}-body-tg`}
            name="body_tg"
            value={draftTg}
            onChange={(e) => setDraftTg(e.target.value)}
            rows={3}
          />
        </Field>
        <Field label={t("notifications.bodyUz")} htmlFor={`${event}-body-uz`}>
          <Textarea
            id={`${event}-body-uz`}
            name="body_uz"
            value={draftUz}
            onChange={(e) => setDraftUz(e.target.value)}
            rows={3}
          />
        </Field>

        <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
          <div className="mb-0.5 text-xs font-medium text-ink-subtle">
            {t("notifications.previewTitle")}
          </div>
          {preview ? (
            <div className="whitespace-pre-line text-ink" dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <span className="text-ink-subtle">—</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          {t("notifications.save")}
        </Button>
        {overridden && (
          <button
            type="button"
            disabled={resetting}
            onClick={() =>
              startReset(async () => {
                await resetNotificationTemplate(event);
                setDraft(defaultBody);
                setDraftTg(DEFAULT_TEMPLATES_I18N.tg[event] ?? "");
                setDraftUz(DEFAULT_TEMPLATES_I18N.uz[event] ?? "");
              })
            }
            className="text-sm font-medium text-ink-muted hover:text-danger hover:underline"
          >
            {t("notifications.resetToDefault")}
          </button>
        )}
        {state.ok && (
          <span className="text-sm font-medium text-success-strong" role="status">
            {t("notifications.saved")}
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
