"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { Button, Field, Input, buttonClass, cx } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

// Логин бота (@BotFather) — та же ссылка, что открывается по кнопке
// «Поделиться контактом» внутри самого Telegram. `?start=support` заводит
// диалог напрямую в чат поддержки (см. src/app/api/telegram/route.ts) —
// не нужно самому искать бота и нажимать кнопку внутри переписки.
const BOT_URL = "https://t.me/cafeteria_farovon_bot";

const microLabel = (text: string) => (
  <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">
    {text}
  </span>
);

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {/* honeypot: скрыт от людей, заполняют боты (§5.1) */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />
      <Field label={microLabel("Логин")} htmlFor="login">
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>
      <Field label={microLabel("Пароль")} htmlFor="password" error={state.error}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" loading={pending} fullWidth size="lg">
        Войти
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main
      className="petal-field relative grid min-h-dvh place-items-center overflow-hidden p-4"
      style={{ paddingTop: "max(1rem, var(--tg-top))" }}
    >
      <PetalDrift />

      <div className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-[28px] shadow-[0_20px_60px_oklch(0.22_0.03_30_/_0.15)]">
        {/* Красная шапка */}
        <div className="bg-primary px-7 pb-8 pt-10 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface shadow-md">
            <BrandMark size={40} priority />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-on-brand">
            Кафетерий льгот
          </h1>
          <p className="mt-1.5 text-sm text-on-brand/80">Ваши льготы. Просто.</p>
        </div>

        {/* Белое тело */}
        <div className="bg-surface p-7">
          <Suspense fallback={<div className="h-[13.5rem]" />}>
            <LoginForm />
          </Suspense>

          <div className="my-5 flex items-center gap-2.5">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs text-ink-subtle">как получить доступ</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <p className="text-center text-xs leading-relaxed text-ink-subtle">
            Логин и одноразовый пароль сотрудник получает в Telegram-боте.
            {process.env.NODE_ENV !== "production" && (
              <>
                <br />
                Демо: c_and_b / contractor / ivanov · пароль Password1
              </>
            )}
          </p>

          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(buttonClass({ variant: "primary", size: "sm" }), "mt-3 w-full")}
          >
            Открыть бота Farovon Cafeteria
          </a>

          <a
            href={`${BOT_URL}?start=support`}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(buttonClass({ variant: "secondary", size: "sm" }), "mt-2 w-full")}
          >
            Не получается войти? Написать администратору
          </a>
        </div>
      </div>
    </main>
  );
}
