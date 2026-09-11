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
    <main
      className="petal-field relative grid min-h-dvh place-items-center overflow-hidden p-4"
      style={{ paddingTop: "max(1rem, var(--tg-top))" }}
    >
      <PetalDrift />
      <div className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-[28px] shadow-[0_20px_60px_oklch(0.22_0.03_30_/_0.15)]">
        <div className="bg-primary px-7 pb-8 pt-10 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface shadow-md">
            <BrandMark size={40} priority />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-on-brand">Смена пароля</h1>
          <p className="mt-1.5 text-sm text-on-brand/80">
            При первом входе необходимо задать постоянный пароль.
          </p>
        </div>
        <div className="bg-surface p-7">
          <form action={formAction} className="space-y-4">
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
      </div>
    </main>
  );
}
