"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Field, Input } from "@/components/ui";
import {
  linkOwnTelegram,
  unlinkOwnTelegram,
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

export function TelegramLink({ linked }: { linked: boolean }) {
  const [pending, start] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(linked);
  const [error, setError] = useState<string | null>(null);

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
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!confirm("Отвязать Telegram от вашей учётной записи?")) return;
            setError(null);
            start(async () => {
              const r = await unlinkOwnTelegram();
              if ("error" in r) setError(r.error);
              else setIsLinked(false);
            });
          }}
        >
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
    </div>
  );
}
