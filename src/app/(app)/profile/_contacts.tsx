"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Field, Input } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  linkOwnTelegram,
  setOwnTelegramId,
  unlinkOwnTelegram,
  unlinkOwnTelegramId,
  updateOwnPhone,
  type ProfileContactState,
} from "./actions";

export function ContactEditor({ phone, locale }: { phone: string | null; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<ProfileContactState, FormData>(
    updateOwnPhone,
    {},
  );

  return (
    <form action={formAction} className="mt-4 max-w-sm space-y-3">
      <Field
        label={t("profile.phone")}
        htmlFor="phone"
        hint={t("profile.phoneHint")}
        error={state.error}
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={phone ?? ""}
          placeholder="+992 900 000 000"
        />
      </Field>
      {state.ok && (
        <p className="text-sm font-medium text-success-strong" role="status">
          {t("profile.phoneSaved")}
        </p>
      )}
      <Button type="submit" size="sm" loading={pending}>
        {t("profile.savePhone")}
      </Button>
    </form>
  );
}

/**
 * Привязка Telegram для служебных учёток (подрядчик, C&B) — без карточки
 * сотрудника: пользователь узнаёт свой ID командой /id в боте и вставляет сюда.
 */
export function ServiceTelegramLink({ linked, locale }: { linked: boolean; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<ProfileContactState, FormData>(
    setOwnTelegramId,
    {},
  );
  const [unpending, startUnlink] = useTransition();
  const [isLinked, setIsLinked] = useState(linked);
  const [confirming, setConfirming] = useState(false);
  const [unlinkErr, setUnlinkErr] = useState<string | null>(null);
  const linkedNow = isLinked || !!state.ok;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-muted">{t("profile.status")}</span>
        {linkedNow ? (
          <Badge tone="success">{t("profile.linked")}</Badge>
        ) : (
          <Badge tone="neutral">{t("profile.notLinked")}</Badge>
        )}
      </div>

      {linkedNow ? (
        <>
          <Button
            variant="danger"
            size="sm"
            disabled={unpending}
            onClick={() => setConfirming(true)}
          >
            {t("profile.unlinkTelegram")}
          </Button>
          {unlinkErr && (
            <p className="text-sm font-medium text-danger" role="alert">
              {unlinkErr}
            </p>
          )}
        </>
      ) : (
        <form action={formAction} className="max-w-sm space-y-2">
          <p className="text-sm leading-6 text-ink-muted">
            {t("profile.telegramIdHint1")} <span className="font-mono text-ink">/id</span>{" "}
            {t("profile.telegramIdHint2")}
          </p>
          <Field label={t("profile.telegramId")} htmlFor="tg-id" error={state.error}>
            <Input
              id="tg-id"
              name="telegramId"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t("profile.telegramIdPlaceholder")}
            />
          </Field>
          {state.ok && (
            <p className="text-sm font-medium text-success-strong" role="status">
              {t("profile.telegramLinked")}
            </p>
          )}
          <Button type="submit" size="sm" loading={pending}>
            {t("profile.linkTelegram")}
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={confirming}
        title={t("profile.unlinkConfirmTitle")}
        message={t("profile.unlinkConfirmMessage1")}
        confirmLabel={t("profile.unlink")}
        tone="danger"
        busy={unpending}
        onConfirm={() => {
          setUnlinkErr(null);
          startUnlink(async () => {
            const r = await unlinkOwnTelegramId();
            if ("error" in r) setUnlinkErr(r.error);
            else setIsLinked(false);
            setConfirming(false);
          });
        }}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}

export function TelegramLink({ linked, locale }: { linked: boolean; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(linked);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function doUnlink() {
    setError(null);
    start(async () => {
      const r = await unlinkOwnTelegram();
      if ("error" in r) setError(r.error);
      else setIsLinked(false);
      setConfirming(false);
    });
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-muted">{t("profile.status")}</span>
        {isLinked ? (
          <Badge tone="success">{t("profile.linked")}</Badge>
        ) : (
          <Badge tone="neutral">{t("profile.notLinked")}</Badge>
        )}
      </div>

      {code ? (
        <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <p className="text-ink-muted">
            {t("profile.telegramCodeHint1")}{" "}
            <span className="font-mono text-ink">/start</span> → {t("profile.telegramCodeHint2")}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-primary-strong">{code}</p>
        </div>
      ) : isLinked ? (
        <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          {t("profile.unlinkTelegram")}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await linkOwnTelegram();
              if ("error" in r) setError(r.error);
              else setCode(r.code);
            });
          }}
        >
          {t("profile.linkTelegram")}
        </Button>
      )}

      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title={t("profile.unlinkConfirmTitle")}
        message={t("profile.unlinkConfirmMessage2")}
        confirmLabel={t("profile.unlink")}
        tone="danger"
        busy={pending}
        onConfirm={doUnlink}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
