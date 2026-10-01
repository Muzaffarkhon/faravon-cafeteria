"use client";

import { useActionState, useRef, useState } from "react";
import { Button, Field, Select, Textarea, cx, inputClass } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/shared";
import type { AudienceFilters } from "@/lib/broadcast-audience";
import { BROADCAST_TEMPLATES } from "@/lib/broadcast-templates";
import { sendBroadcast, type BroadcastState } from "./actions";

const FIELD: Record<Locale, string> = { ru: "text", tg: "text_tg", uz: "text_uz" };
const EMPTY: Record<Locale, string> = { ru: "", tg: "", uz: "" };
const MAX = 3500;

// Поле datetime-local — время по Душанбе (UTC+5), независимо от часового пояса браузера админа.
const DUSHANBE_MS = 5 * 60 * 60 * 1000;
const nowLocal = () => new Date(Date.now() + DUSHANBE_MS).toISOString().slice(0, 16);
const fmtLocal = (v: string) => {
  const [d, time] = v.split("T");
  return `${d.split("-").reverse().join(".")} ${time}`;
};

export function BroadcastForm({
  filters,
  recipients,
  byLocale,
  locale,
  audienceLabel,
}: {
  filters: AudienceFilters;
  recipients: number;
  byLocale: Record<Locale, number>;
  locale: Locale;
  /** Кому уходит — одной строкой, для окна подтверждения. */
  audienceLabel: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [texts, setTexts] = useState<Record<Locale, string>>(EMPTY);
  const [lang, setLang] = useState<Locale>("ru");
  // null — значение по умолчанию для сегмента (для «по льготе» — спрашивать подтверждение).
  const [askConfirm, setAskConfirm] = useState<boolean | null>(null);
  const [couponHint, setCouponHint] = useState(false);
  const [later, setLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // После успешной отправки форма очищается — повторное нажатие не продублирует рассылку.
  const [state, formAction, pending] = useActionState<BroadcastState, FormData>(async (prev, fd) => {
    const res = await sendBroadcast(prev, fd);
    if (res.sent != null || res.scheduledAt) {
      setTexts(EMPTY);
      setLang("ru");
      setLater(false);
      setScheduledAt("");
    }
    return res;
  }, {});
  const whenLabel = later && scheduledAt ? fmtLocal(scheduledAt) : null;

  const guests = filters.segment === "NOT_REGISTERED";
  const confirmOn = !guests && (askConfirm ?? filters.segment === "BY_CARD");
  // Шаблоны выбранной аудитории — первыми.
  const templates = [...BROADCAST_TEMPLATES].sort(
    (a, b) => Number(b.segment === filters.segment) - Number(a.segment === filters.segment),
  );
  // Язык, на котором есть получатели, но нет перевода: им уйдёт русский текст.
  const missing = LOCALES.filter((l) => l !== "ru" && byLocale[l] > 0 && !texts[l].trim());

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {/* Те же фильтры, что применены слева: получатели пересчитываются на сервере при отправке. */}
      {(Object.keys(filters) as (keyof AudienceFilters)[]).map((k) => (
        <input key={k} type="hidden" name={k} value={filters[k]} />
      ))}
      <input type="hidden" name="expected" value={recipients} />
      <input type="hidden" name="askConfirm" value={confirmOn ? "on" : ""} />
      <input type="hidden" name="couponHint" value={!guests && couponHint ? "on" : ""} />

      <Field label={t("broadcast.template")} htmlFor="template" hint={t("broadcast.templateHint")}>
        <Select
          id="template"
          value=""
          onChange={(e) => {
            const tpl = BROADCAST_TEMPLATES.find((x) => x.id === e.target.value);
            if (!tpl) return;
            if (LOCALES.some((l) => texts[l].trim()) && !window.confirm("Заменить уже набранный текст шаблоном?")) return;
            setTexts({ ...tpl.text });
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

      {/* Три языка — вкладками, а не тремя полями подряд: форма не уезжает за экран. */}
      <div>
        <div role="tablist" aria-label="Язык текста" className="flex gap-1 border-b border-line">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
              className={cx(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                lang === l ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {LOCALE_LABELS[l]}
              {l === "ru" && <span className="text-primary">*</span>}
              <span className="text-xs font-normal text-ink-subtle tabular-nums">{byLocale[l]}</span>
              {texts[l].trim() ? (
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-label="заполнено" />
              ) : missing.includes(l) ? (
                <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-label="нет перевода" />
              ) : null}
            </button>
          ))}
        </div>
        {LOCALES.map((l) => (
          <div key={l} role="tabpanel" hidden={lang !== l} className="pt-3">
            <Textarea
              id={FIELD[l]}
              name={FIELD[l]}
              aria-label={t(`broadcast.text${l === "ru" ? "Ru" : l === "tg" ? "Tg" : "Uz"}` as const)}
              required={l === "ru"}
              rows={10}
              maxLength={MAX}
              value={texts[l]}
              onChange={(e) => setTexts({ ...texts, [l]: e.target.value })}
              onInvalid={() => setLang(l)}
              placeholder={t("broadcast.textPlaceholder")}
            />
            <p className="mt-1 text-right text-xs text-ink-subtle tabular-nums">
              {texts[l].length} / {MAX}
            </p>
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs font-medium text-warning-strong">
          {t("broadcast.fallbackHint")} ({missing.map((l) => `${LOCALE_LABELS[l]} — ${byLocale[l]}`).join(", ")})
        </p>
      )}

      {!guests && (
        <fieldset className="space-y-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Дополнительно</legend>
          <label className="flex items-start gap-2.5 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={confirmOn}
              onChange={(e) => setAskConfirm(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--primary)]"
            />
            <span>
              Спросить подтверждение — кнопки «Да / Нет»
              <span className="mt-1 block text-xs font-normal text-ink-muted">
                Например: «Вы точно пойдёте?». Ответы — во вкладке «История и ответы»; оттуда же можно написать отдельно
                ответившим «Да», «Нет» или промолчавшим. При «Нет» бот попросит причину, диалог продолжится в «Поддержке».
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={couponHint}
              onChange={(e) => setCouponHint(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--primary)]"
            />
            <span>
              Добавить напоминание: показать купон на сайте
              <span className="mt-1 block text-xs font-normal text-ink-muted">
                В конец сообщения на языке сотрудника: «Для подтверждения купона покажите его партнёру из раздела «Мои
                заявки и купоны» на сайте» — со ссылкой на этот раздел.
              </span>
            </span>
          </label>
        </fieldset>
      )}

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
      {state.scheduledAt && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Рассылка запланирована на {new Date(state.scheduledAt).toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe", dateStyle: "short", timeStyle: "short" })}.
          Отменить её можно во вкладке «История и ответы».
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Когда отправить</legend>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={!later} onChange={() => setLater(false)} className="accent-[var(--primary)]" />
            Сейчас
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={later} onChange={() => setLater(true)} className="accent-[var(--primary)]" />
            Запланировать
          </label>
          {later && (
            <input
              type="datetime-local"
              name="scheduledAt"
              required
              aria-label="Дата и время отправки (Душанбе)"
              min={nowLocal()}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={inputClass("w-auto")}
            />
          )}
        </div>
        {later && (
          <p className="text-xs text-ink-muted">
            Время — по Душанбе. Получатели соберутся заново в момент отправки: попадут и те, кто подключится позже.
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4">
        <p className="min-w-0 flex-1 text-xs text-ink-muted">{audienceLabel}</p>
        <Button
          type="button"
          loading={pending}
          disabled={recipients === 0}
          onClick={() => formRef.current?.reportValidity() && setConfirming(true)}
        >
          {later ? "Запланировать" : t("broadcast.send")} ({recipients})
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={later ? "Запланировать рассылку?" : t("broadcast.confirmTitle")}
        message={
          <>
            {whenLabel ? (
              <>
                Отправка <b className="text-ink">{whenLabel}</b> (Душанбе). Сейчас под фильтр попадают{" "}
                <b className="text-ink">{recipients}</b> {t("broadcast.confirmPeople")}
              </>
            ) : (
              <>
                {t("broadcast.confirmRecipients")} <b className="text-ink">{recipients}</b> {t("broadcast.confirmPeople")}
              </>
            )}
            <br />
            {audienceLabel}
            {(confirmOn || couponHint) && (
              <>
                <br />
                {[confirmOn && "с кнопками «Да / Нет»", couponHint && "с напоминанием о купоне"].filter(Boolean).join(", ")}
              </>
            )}
            <br />
            {later ? "До этого времени рассылку можно отменить в истории." : t("broadcast.confirmIrreversible")}
          </>
        }
        confirmLabel={later ? "Запланировать" : t("broadcast.confirmSend")}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
