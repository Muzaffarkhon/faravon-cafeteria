"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
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
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label={repeatPasswordLabel} htmlFor="confirm" error={state.error}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" loading={pending} fullWidth size="lg">
        {saveLabel}
      </Button>
    </form>
  );
}
