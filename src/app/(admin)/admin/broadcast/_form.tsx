"use client";

import { useActionState, useRef, useState } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import { LOCALES, type Locale } from "@/lib/i18n/shared";
import type { AudienceFilters } from "@/lib/broadcast-audience";
import { BROADCAST_TEMPLATES } from "@/lib/broadcast-templates";
import { sendBroadcast, type BroadcastState } from "./actions";

const FIELD: Record<Locale, string> = { ru: "text", tg: "text_tg", uz: "text_uz" };
const LABEL = { ru: "broadcast.textRu", tg: "broadcast.textTg", uz: "broadcast.textUz" } as const;

export function BroadcastForm({
  filters,
  recipients,
  byLocale,
  locale,
}: {
  filters: AudienceFilters;
  recipients: number;
  byLocale: Record<Locale, number>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<BroadcastState, FormData>(sendBroadcast, {});
  const [texts, setTexts] = useState<Record<Locale, string>>({ ru: "", tg: "", uz: "" });
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Шаблоны выбранной аудитории — первыми.
  const templates = [...BROADCAST_TEMPLATES].sort(
    (a, b) => Number(b.segment === filters.segment) - Number(a.segment === filters.segment),
  );
  // Язык, на котором есть получатели, но нет перевода: им уйдёт русский текст.
  const missing = LOCALES.filter((l) => l !== "ru" && byLocale[l] > 0 && !texts[l].trim());

  return (
    <form ref={formRef} action={formAction} className="max-w-xl space-y-4">
      {/* Те же фильтры, что показаны выше: получатели пересчитываются на сервере при отправке. */}
      <input type="hidden" name="segment" value={filters.segment} />
      <input type="hidden" name="department" value={filters.department} />
      <input type="hidden" name="position" value={filters.position} />
      <input type="hidden" name="q" value={filters.q} />

      <Field label={t("broadcast.template")} htmlFor="template" hint={t("broadcast.templateHint")}>
        <Select
          id="template"
          value=""
          onChange={(e) => {
            const tpl = BROADCAST_TEMPLATES.find((x) => x.id === e.target.value);
            if (tpl) setTexts({ ...tpl.text });
          }}
        >
          <option value="">{t("broadcast.noTemplate")}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.segment === filters.segment && filters.segment !== "ALL" ? "★ " : ""}
              {tpl.title[locale]}
            </option>
          ))}
        </Select>
      </Field>

      {LOCALES.map((l) => (
        <Field
          key={l}
          label={`${t(LABEL[l])}${byLocale[l] > 0 ? ` · ${byLocale[l]}` : ""}`}
          htmlFor={FIELD[l]}
        >
          <Textarea
            id={FIELD[l]}
            name={FIELD[l]}
            required={l === "ru"}
            rows={l === "ru" ? 9 : 7}
            maxLength={3500}
            value={texts[l]}
            onChange={(e) => setTexts({ ...texts, [l]: e.target.value })}
            placeholder={t("broadcast.textPlaceholder")}
          />
        </Field>
      ))}
      {missing.length > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs font-medium text-warning-strong">
          {t("broadcast.fallbackHint")} ({missing.map((l) => l.toUpperCase()).join(", ")})
        </p>
      )}

      <Button
        type="button"
        loading={pending}
        disabled={recipients === 0}
        onClick={() => formRef.current?.reportValidity() && setConfirming(true)}
      >
        {t("broadcast.send")} ({recipients})
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("broadcast.confirmTitle")}
        message={
          <>
            {t("broadcast.confirmRecipients")} <b className="text-ink">{recipients}</b> {t("broadcast.confirmPeople")}
            <br />
            {t(`broadcast.segment.${filters.segment}` as const)}
            {filters.department && <> · {filters.department}</>}
            {filters.position && <> · {filters.position}</>}
            <br />
            {t("broadcast.confirmIrreversible")}
          </>
        }
        confirmLabel={t("broadcast.confirmSend")}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      />

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.sent != null && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          {t("broadcast.sentPrefix")} {state.sent} {t("broadcast.sentSuffix")}
          {state.failed ? ` ${t("broadcast.notDelivered")}: ${state.failed}.` : ""}
        </p>
      )}
    </form>
  );
}
