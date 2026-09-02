"use client";

import { useActionState } from "react";
import { BrandMark } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { Button, Field, Input } from "@/components/ui";
import { changePasswordAction, type ChangeState } from "./actions";

const initial: ChangeState = {};

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);
  return (
    <main className="petal-field relative grid min-h-dvh place-items-center overflow-hidden p-4">
      <PetalDrift />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <BrandMark size={56} />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">Смена пароля</h1>
          <p className="mt-1 text-sm text-ink-muted">
            При первом входе необходимо задать постоянный пароль.
          </p>
        </div>
        <form action={formAction} className="mt-6 space-y-4">
          <Field label="Новый пароль" htmlFor="password" hint="Минимум 8 символов, буквы и цифры.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Повторите пароль" htmlFor="confirm" error={state.error}>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <Button type="submit" loading={pending} fullWidth size="lg">
            Сохранить
          </Button>
        </form>
      </div>
    </main>
  );
}
