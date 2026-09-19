"use client";

import { useActionState, useState } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import type { AudienceFilters } from "@/lib/broadcast-audience";
import { SEGMENT_LABELS } from "@/lib/broadcast-segments";
import { BROADCAST_TEMPLATES } from "@/lib/broadcast-templates";
import { sendBroadcast, type BroadcastState } from "./actions";

export function BroadcastForm({
  filters,
  recipients,
  locale,
}: {
  filters: AudienceFilters;
  recipients: number;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<BroadcastState, FormData>(sendBroadcast, {});
  const [text, setText] = useState("");

  // Шаблоны выбранной аудитории — первыми.
  const templates = [...BROADCAST_TEMPLATES].sort(
    (a, b) => Number(b.segment === filters.segment) - Number(a.segment === filters.segment),
  );

  return (
    <form
      action={formAction}
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        if (!confirm(`Отправить сообщение: ${recipients} получателям?\n(${SEGMENT_LABELS[filters.segment]})`)) e.preventDefault();
      }}
    >
      {/* Те же фильтры, что показаны выше: получатели пересчитываются на сервере при отправке. */}
      <input type="hidden" name="segment" value={filters.segment} />
      <input type="hidden" name="department" value={filters.department} />
      <input type="hidden" name="position" value={filters.position} />
      <input type="hidden" name="q" value={filters.q} />

      <Field label="Шаблон" htmlFor="template" hint="Выберите готовый текст и отредактируйте его. Пометки в [квадратных скобках] нужно заполнить.">
        <Select
          id="template"
          value=""
          onChange={(e) => {
            const tpl = BROADCAST_TEMPLATES.find((x) => x.id === e.target.value);
            if (tpl) setText(tpl.text);
          }}
        >
          <option value="">— без шаблона —</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.segment === filters.segment && filters.segment !== "ALL" ? "★ " : ""}
              {tpl.title}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("broadcast.textLabel")} htmlFor="text">
        <Textarea
          id="text"
          name="text"
          required
          rows={10}
          maxLength={3500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("broadcast.textPlaceholder")}
        />
      </Field>

      <Button type="submit" loading={pending} disabled={recipients === 0}>
        {t("broadcast.send")} ({recipients})
      </Button>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.sent != null && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          {t("broadcast.sentPrefix")} {state.sent} {t("broadcast.sentSuffix")}
          {state.failed ? ` Не доставлено: ${state.failed}.` : ""}
        </p>
      )}
    </form>
  );
}
