"use client";

import { useActionState, useRef, useEffect } from "react";
import { Button, Field, Input } from "@/components/ui";
import { changeOwnPassword, type ProfilePwState } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ProfilePwState, FormData>(changeOwnPassword, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="mt-5 max-w-sm space-y-4">
      <Field label="Текущий пароль" htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Новый пароль" htmlFor="password" hint="Минимум 8 символов, буквы и цифры.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Повторите новый пароль" htmlFor="confirm" error={state.error}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>

      {state.ok && <p className="text-sm font-medium text-success-strong" role="status">Пароль изменён.</p>}

      <Button type="submit" loading={pending}>
        Сменить пароль
      </Button>
    </form>
  );
}
