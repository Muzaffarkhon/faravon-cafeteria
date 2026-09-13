"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Field, Input } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  linkOwnTelegram,
  setOwnTelegramId,
  unlinkOwnTelegram,
  unlinkOwnTelegramId,
  updateOwnPhone,
  type ProfileContactState,
} from "./actions";

export function ContactEditor({ phone }: { phone: string | null }) {
  const [state, formAction, pending] = useActionState<ProfileContactState, FormData>(
    updateOwnPhone,
    {},
  );

  return (
    <form action={formAction} className="mt-4 max-w-sm space-y-3">
      <Field
        label="Телефон"
        htmlFor="phone"
        hint="Используется для идентификации в Telegram-боте."
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
          Телефон сохранён.
        </p>
      )}
      <Button type="submit" size="sm" loading={pending}>
        Сохранить телефон
      </Button>
    </form>
  );
}

/**
 * Привязка Telegram для служебных учёток (подрядчик, C&B) — без карточки
 * сотрудника: пользователь узнаёт свой ID командой /id в боте и вставляет сюда.
 */
export function ServiceTelegramLink({ linked }: { linked: boolean }) {
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
        <span className="text-sm text-ink-muted">Статус:</span>
        {linkedNow ? (
          <Badge tone="success">привязан</Badge>
        ) : (
          <Badge tone="neutral">не привязан</Badge>
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
            Отвязать Telegram
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
            Откройте бота, отправьте команду <span className="font-mono text-ink">/id</span> и
            вставьте полученное число сюда.
          </p>
          <Field label="Telegram ID" htmlFor="tg-id" error={state.error}>
            <Input
              id="tg-id"
              name="telegramId"
              inputMode="numeric"
              autoComplete="off"
              placeholder="напр. 123456789"
            />
          </Field>
          {state.ok && (
            <p className="text-sm font-medium text-success-strong" role="status">
              Telegram привязан.
            </p>
          )}
          <Button type="submit" size="sm" loading={pending}>
            Привязать Telegram
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={confirming}
        title="Отвязать Telegram?"
        message="Уведомления перестанут приходить, пока вы не привяжете аккаунт заново."
        confirmLabel="Отвязать"
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

export function TelegramLink({ linked }: { linked: boolean }) {
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
        <span className="text-sm text-ink-muted">Статус:</span>
        {isLinked ? (
          <Badge tone="success">привязан</Badge>
        ) : (
          <Badge tone="neutral">не привязан</Badge>
        )}
      </div>

      {code ? (
        <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <p className="text-ink-muted">
            Отправьте этот код Telegram-боту командой{" "}
            <span className="font-mono text-ink">/start</span> → «Ввести код» (действует 72&nbsp;ч):
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-primary-strong">{code}</p>
        </div>
      ) : isLinked ? (
        <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          Отвязать Telegram
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
          Привязать Telegram
        </Button>
      )}

      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title="Отвязать Telegram?"
        message="Уведомления и вход через бота перестанут работать, пока вы не привяжете аккаунт заново."
        confirmLabel="Отвязать"
        tone="danger"
        busy={pending}
        onConfirm={doUnlink}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
