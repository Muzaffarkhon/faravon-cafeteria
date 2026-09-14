"use client";

import { useActionState } from "react";
import { Button, Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { changePasswordAction, type ChangeState } from "./actions";

const initial: ChangeState = {};

export function ChangePasswordForm({
  newPasswordLabel,
  newPasswordHint,
  repeatPasswordLabel,
  saveLabel,
}: {
  newPasswordLabel: string;
  newPasswordHint: string;
  repeatPasswordLabel: string;
  saveLabel: string;
}) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      <Field label={newPasswordLabel} htmlFor="password" hint={newPasswordHint}>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label={repeatPasswordLabel} htmlFor="confirm" error={state.error}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" loading={pending} fullWidth size="lg">
        {saveLabel}
      </Button>
    </form>
  );
}
