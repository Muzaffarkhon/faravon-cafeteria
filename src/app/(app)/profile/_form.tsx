"use client";

import { useActionState, useRef, useEffect } from "react";
import { Button, Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { changeOwnPassword, type ProfilePwState } from "./actions";

export function ChangePasswordForm({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<ProfilePwState, FormData>(changeOwnPassword, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="mt-5 max-w-sm space-y-4">
      <Field label={t("profile.currentPassword")} htmlFor="current">
        <PasswordInput id="current" name="current" autoComplete="current-password" required />
      </Field>
      <Field label={t("profile.newPassword")} htmlFor="password" hint={t("profile.newPasswordHint")}>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label={t("profile.repeatPassword")} htmlFor="confirm" error={state.error}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>

      {state.ok && <p className="text-sm font-medium text-success-strong" role="status">{t("profile.passwordChanged")}</p>}

      <Button type="submit" loading={pending}>
        {t("profile.changePassword")}
      </Button>
    </form>
  );
}
