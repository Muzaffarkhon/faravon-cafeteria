"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { Button, Field, Input } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="mt-6 space-y-4">
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
      <Field label="Логин" htmlFor="login">
        <Input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Пароль" htmlFor="password" error={state.error}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
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
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <BrandMark size={56} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Кафетерий льгот</h1>
          <p className="mt-1 text-sm text-ink-muted">Группа компаний «Фаровон»</p>
        </div>

        <Suspense fallback={<div className="mt-6 h-52" />}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-subtle">
          Логин и одноразовый пароль сотрудник получает в Telegram-боте.
          {process.env.NODE_ENV !== "production" && (
            <>
              <br />
              Демо-доступ: c_and_b / contractor / ivanov, пароль Password1
            </>
          )}
        </p>
      </div>
    </main>
  );
}
